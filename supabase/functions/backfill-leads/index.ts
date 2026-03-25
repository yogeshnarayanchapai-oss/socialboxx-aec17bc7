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
  // Skip URLs/attachments
  if (text.includes("facebook.com") || text.includes("fbcdn") || text.includes("scontent") || text.includes("cdn.fbsbx")) return null;
  const converted = convertNepaliDigits(text);
  const digitGroups = converted.match(/\d+/g);
  if (!digitGroups) return null;
  const allDigits = digitGroups.join('');
  if (allDigits.length < 9) return null;
  let digits = allDigits;
  if (digits.startsWith('977') && digits.length >= 12) digits = digits.substring(3);
  if (digits.startsWith('9') && digits.length >= 10) return digits.slice(0, 10);
  if (allDigits.length >= 10) return allDigits.slice(0, 10);
  return null;
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
    const { _batchOffset } = body;
    const offset = _batchOffset || 0;

    // Use RPC or direct SQL to find conversations with phone numbers efficiently
    // First get conversation IDs that have customer messages with phone-like patterns
    const { data: convIds, error: convErr } = await supabase
      .rpc('find_conversations_with_phones' as any, { _offset: offset, _limit: BATCH_SIZE })
      .select('*');

    // Fallback: if RPC doesn't exist, use the manual approach
    // Get conversations that DON'T have lead-created tag
    // and have customer messages with phone numbers
    const { data: candidates, error: candErr } = await supabase
      .from("conversations")
      .select("id, participant_name, page_id, organization_id, tags")
      .is("deleted_at", null)
      .not("tags", "cs", '{"lead-created"}')
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);

    if (candErr) throw candErr;
    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Backfill complete", offset }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let created = 0;
    let existing = 0;
    let processed = 0;

    for (const conv of candidates) {
      if ((conv.tags || []).includes("lead-created")) continue;

      // Get customer messages
      const { data: msgs } = await supabase
        .from("messages")
        .select("content, sender_type")
        .eq("conversation_id", conv.id)
        .eq("sender_type", "customer")
        .order("created_at", { ascending: true });

      if (!msgs || msgs.length === 0) continue;

      // Find phone numbers
      let foundPhone: string | null = null;
      for (const msg of msgs) {
        const phone = extractPhoneNumber(msg.content || "");
        if (phone) {
          foundPhone = phone;
          break;
        }
      }

      if (!foundPhone) continue;
      processed++;

      const normalizedPhone = foundPhone.replace(/\D/g, '').slice(-10);

      // Dedup
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("organization_id", conv.organization_id)
        .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
        .maybeSingle();

      if (existingLead) {
        await supabase.from("leads").update({
          conversation_id: conv.id,
          updated_at: new Date().toISOString(),
        }).eq("id", existingLead.id);
        existing++;
      } else {
        const inquiryTexts = msgs
          .map((m: any) => m.content || "")
          .filter((t: string) => {
            const stripped = t.replace(/[\s\-\(\)\.\+]/g, '');
            return t.trim().length > 0 && !/^\d{9,}$/.test(stripped) && !t.includes("facebook.com") && !t.includes("fbcdn");
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
        created++;
      }

      // Tag conversation
      const tags = conv.tags || [];
      if (!tags.includes("lead-created")) {
        await supabase.from("conversations").update({
          tags: [...tags, "lead-created"],
          ai_followup_step: null,
          ai_followup_next_at: null,
        }).eq("id", conv.id);
      }
    }

    console.log(`Backfill batch offset=${offset}: created=${created}, existing=${existing}, processed=${processed}, scanned=${candidates.length}`);

    // If we got 1000 results, trigger next batch
    if (candidates.length === 1000) {
      const nextOffset = offset + 1000;
      fetch(`${supabaseUrl}/functions/v1/backfill-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({ _batchOffset: nextOffset }),
      }).catch(err => console.error("Failed to trigger next backfill batch:", err));
    }

    return new Response(JSON.stringify({
      success: true,
      created,
      existing,
      processed,
      scanned: candidates.length,
      offset,
      hasMore: candidates.length === 1000,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Backfill error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
