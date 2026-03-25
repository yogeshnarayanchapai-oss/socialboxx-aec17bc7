import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50;

function convertNepaliDigits(text: string): string {
  const nd: Record<string, string> = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9' };
  return text.replace(/[०-९]/g, d => nd[d] || d);
}

function extractPhoneNumber(text: string): string | null {
  if (!text) return null;
  const converted = convertNepaliDigits(text);
  const digitGroups = converted.match(/\d+/g);
  if (!digitGroups) return null;
  const allDigits = digitGroups.join('');
  if (allDigits.length < 9) return null;
  let digits = allDigits;
  if (digits.startsWith('977') && digits.length >= 12) digits = digits.substring(3);
  if (digits.startsWith('9') && digits.length >= 10) return digits;
  if (allDigits.length >= 10) return allDigits;
  return null;
}

async function processConversation(supabase: any, conv: any) {
  const { data: msgs } = await supabase
    .from("messages")
    .select("content, sender_type")
    .eq("conversation_id", conv.id)
    .eq("sender_type", "customer")
    .order("created_at", { ascending: true });

  if (!msgs || msgs.length === 0) return null;

  let foundPhone: string | null = null;
  for (const msg of msgs) {
    const phone = extractPhoneNumber(msg.content || "");
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10 && digits.startsWith('9')) {
        foundPhone = phone;
        break;
      }
    }
  }

  if (!foundPhone) return null;

  const normalizedPhone = foundPhone.replace(/\D/g, '').slice(-10);

  // Dedup
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("organization_id", conv.organization_id)
    .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
    .maybeSingle();

  if (existingLead) {
    // Link conversation if not already
    await supabase.from("leads").update({
      conversation_id: conv.id,
      updated_at: new Date().toISOString(),
    }).eq("id", existingLead.id);

    // Tag conversation
    const tags = conv.tags || [];
    if (!tags.includes("lead-created")) {
      await supabase.from("conversations").update({
        tags: [...tags, "lead-created"],
        ai_followup_step: null,
        ai_followup_next_at: null,
      }).eq("id", conv.id);
    }
    return { status: "existing", phone: foundPhone };
  }

  // Get inquiry texts for remark
  const inquiryTexts = msgs
    .map((m: any) => m.content || "")
    .filter((t: string) => {
      const stripped = t.replace(/[\s\-\(\)\.\+]/g, '');
      return t.trim().length > 0 && !/^\d{9,}$/.test(stripped);
    });

  let remark = "No Inquiry";
  if (inquiryTexts.length > 0) {
    remark = inquiryTexts.join(' | ').substring(0, 500);
  }

  const { data: pageInfo } = await supabase
    .from("connected_pages")
    .select("page_name, product_name")
    .eq("id", conv.page_id)
    .single();

  await supabase.from("leads").insert({
    phone: foundPhone,
    full_name: conv.participant_name || "Unknown",
    conversation_id: conv.id,
    page_id: conv.page_id,
    source: pageInfo?.page_name || "Unknown",
    product: pageInfo?.product_name || null,
    last_message: msgs[msgs.length - 1]?.content?.substring(0, 200),
    status: "new",
    organization_id: conv.organization_id,
    remark,
  });

  // Tag conversation
  const tags = conv.tags || [];
  if (!tags.includes("lead-created")) {
    await supabase.from("conversations").update({
      tags: [...tags, "lead-created"],
      ai_followup_step: null,
      ai_followup_next_at: null,
    }).eq("id", conv.id);
  }

  return { status: "created", phone: foundPhone };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    if (token !== supabaseKey) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { _batchOffset, _batchOrgId } = body;
    const isInternalBatch = !!_batchOrgId;
    const offset = _batchOffset || 0;

    // Determine org - for internal batch use stored orgId
    let orgId = _batchOrgId;

    if (!isInternalBatch) {
      // Get org from user or process all orgs
      // For simplicity, scan ALL conversations without lead-created tag
    }

    // Fetch conversations without lead-created tag
    const query = supabase
      .from("conversations")
      .select("id, participant_name, page_id, organization_id, tags")
      .is("deleted_at", null)
      .not("tags", "cs", '{"lead-created"}')
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (orgId) {
      query.eq("organization_id", orgId);
    }

    const { data: conversations, error: convErr } = await query;
    if (convErr) throw convErr;

    if (!conversations || conversations.length === 0) {
      console.log(`Backfill complete at offset ${offset}. No more conversations.`);
      return new Response(JSON.stringify({
        success: true,
        message: "Backfill complete",
        offset,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Also filter out ones that already have lead-created tag (double check)
    const toProcess = conversations.filter(c => !(c.tags || []).includes("lead-created"));

    let created = 0;
    let existing = 0;
    let noPhone = 0;

    for (const conv of toProcess) {
      const result = await processConversation(supabase, conv);
      if (!result) { noPhone++; continue; }
      if (result.status === "created") created++;
      else existing++;
    }

    console.log(`Backfill batch offset=${offset}: created=${created}, existing=${existing}, noPhone=${noPhone}, batch=${toProcess.length}`);

    // If we got a full batch, trigger next batch
    if (conversations.length === BATCH_SIZE) {
      const nextOffset = offset + BATCH_SIZE;
      const effectiveOrgId = orgId || conversations[0]?.organization_id;

      fetch(`${supabaseUrl}/functions/v1/backfill-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({ _batchOffset: nextOffset, _batchOrgId: effectiveOrgId }),
      }).catch(err => console.error("Failed to trigger next backfill batch:", err));
    }

    return new Response(JSON.stringify({
      success: true,
      created,
      existing,
      noPhone,
      batchSize: toProcess.length,
      offset,
      hasMore: conversations.length === BATCH_SIZE,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Backfill error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
