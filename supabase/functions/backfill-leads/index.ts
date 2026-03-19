import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });
  const token = authHeader.replace("Bearer ", "");
  if (token !== supabaseKey) {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Find conversations that have been replied to, have NO lead-created tag,
    // and where a customer sent a phone number
    const { data: conversations, error: convErr } = await supabase
      .from("conversations")
      .select("id, participant_name, page_id, organization_id, tags")
      .is("deleted_at", null)
      .not("tags", "cs", '{"lead-created"}');

    if (convErr) throw convErr;

    let created = 0;
    let skipped = 0;
    const results: Array<{ conv_id: string; phone: string; name: string; status: string }> = [];

    for (const conv of conversations || []) {
      // Get customer messages
      const { data: msgs } = await supabase
        .from("messages")
        .select("content, sender_type")
        .eq("conversation_id", conv.id)
        .eq("sender_type", "customer")
        .order("created_at", { ascending: true });

      if (!msgs || msgs.length === 0) continue;

      // Find phone numbers in customer messages
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

      if (!foundPhone) continue;

      const normalizedPhone = foundPhone.replace(/\D/g, '').slice(-10);

      // Dedup: check if lead already exists for this phone in this org
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("organization_id", conv.organization_id)
        .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
        .maybeSingle();

      if (existingLead) {
        // Update existing lead to link to this conversation if not already linked
        await supabase.from("leads").update({
          conversation_id: conv.id,
          updated_at: new Date().toISOString(),
        }).eq("id", existingLead.id);
        skipped++;
        results.push({ conv_id: conv.id, phone: foundPhone, name: conv.participant_name || "Unknown", status: "existing-updated" });
      } else {
        // Get inquiry texts for remark
        const inquiryTexts = msgs
          .map(m => m.content || "")
          .filter(t => {
            const stripped = t.replace(/[\s\-\(\)\.\+]/g, '');
            return t.trim().length > 0 && !/^\d{9,}$/.test(stripped);
          });

        let remark = "No Inquiry";
        if (inquiryTexts.length > 0 && LOVABLE_API_KEY) {
          try {
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  { role: "system", content: "You are an inquiry summarizer. Given customer chat messages, extract what the customer is inquiring about and write a very short summary (max 10 words) in English starting with 'Inquiry for...'. If no clear inquiry, respond with 'No Inquiry'. Only output the summary." },
                  { role: "user", content: `Customer messages:\n${inquiryTexts.join('\n')}` }
                ],
              }),
            });
            if (aiResp.ok) {
              const d = await aiResp.json();
              const s = d.choices?.[0]?.message?.content?.trim();
              if (s) remark = s.substring(0, 200);
            }
          } catch {}
        } else if (inquiryTexts.length > 0) {
          remark = inquiryTexts.join(' | ').substring(0, 500);
        }

        // Get page info for source/product
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
        results.push({ conv_id: conv.id, phone: foundPhone, name: conv.participant_name || "Unknown", status: "created" });
      }

      // Tag conversation as lead-created
      const tags = conv.tags || [];
      if (!tags.includes("lead-created")) {
        await supabase.from("conversations").update({
          tags: [...tags, "lead-created"],
          ai_followup_step: null,
          ai_followup_next_at: null,
        }).eq("id", conv.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      created,
      skipped,
      total_scanned: conversations?.length || 0,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Backfill error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
