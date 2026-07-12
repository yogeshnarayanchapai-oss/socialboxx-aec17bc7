import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 25;

function convertNepaliDigits(text: string): string {
  const nd: Record<string, string> = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9' };
  return text.replace(/[०-९]/g, d => nd[d] || d);
}

function extractPhoneNumber(text: string): string | null {
  if (!text) return null;
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

function isDuplicateLeadInsertError(error: any): boolean {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key") || details.includes("duplicate key");
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
    const { _batchOffset, restoreMode, dateFilter } = body;
    const offset = _batchOffset || 0;
    // === COMPLAIN MODE: scan recent conversations (today + yesterday, Nepal TZ) for missed phones ===
    if (body.complainMode) {
      // Nepal midnight = UTC 18:15 previous day. Default: yesterday 00:00 Nepal onward.
      const now = new Date();
      const nepalNow = new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000);
      const yStart = new Date(Date.UTC(nepalNow.getUTCFullYear(), nepalNow.getUTCMonth(), nepalNow.getUTCDate() - 1, 0, 0, 0));
      // shift back to UTC by subtracting 5h45m
      const sinceCutoff = body.sinceDate || new Date(yStart.getTime() - (5 * 60 + 45) * 60 * 1000).toISOString();
      console.log(`Complain-mode backfill: offset=${offset}, since=${sinceCutoff}`);
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, participant_name, page_id, organization_id, tags")
        .is("deleted_at", null)
        .contains("tags", ["COMPLAIN"])
        .gte("created_at", sinceCutoff)
        .order("created_at", { ascending: false })
        .range(offset, offset + 199);

      if (!convs || convs.length === 0) {
        console.log(`Complain backfill done at offset=${offset}`);
        return new Response(JSON.stringify({ success: true, message: "Complain backfill done", offset }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let created = 0, scanned = 0;
      for (const conv of convs) {
        scanned++;
        const { data: msgs } = await supabase
          .from("messages")
          .select("content")
          .eq("conversation_id", conv.id)
          .eq("sender_type", "customer")
          .order("created_at", { ascending: true });

        let foundPhone: string | null = null;
        const inquiryTexts: string[] = [];
        for (const m of (msgs || [])) {
          const c = m.content || "";
          if (!foundPhone) {
            const p = extractPhoneNumber(c);
            if (p) foundPhone = p;
          }
          const stripped = c.replace(/[\s\-\(\)\.\+]/g, '');
          if (c.trim().length > 0 && !/^\d{9,}$/.test(stripped) && !c.includes("facebook.com") && !c.includes("fbcdn")) {
            inquiryTexts.push(c);
          }
        }
        if (!foundPhone) continue;

        const normalizedPhone = foundPhone.replace(/\D/g, '').slice(-10);
        const { data: dup } = await supabase
          .from("leads")
          .select("id")
          .eq("organization_id", conv.organization_id)
          .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
          .maybeSingle();
        if (dup) {
          await supabase.from("leads").update({ conversation_id: conv.id, updated_at: new Date().toISOString() }).eq("id", dup.id);
        } else {
          const { data: pageInfo } = await supabase
            .from("connected_pages").select("page_name, product_name").eq("id", conv.page_id).single();
          const remark = inquiryTexts.length > 0 ? inquiryTexts.join(' | ').substring(0, 500) : "No Inquiry";
          const { error: insertError } = await supabase.from("leads").insert({
            phone: foundPhone,
            full_name: conv.participant_name || "Unknown",
            conversation_id: conv.id,
            page_id: conv.page_id,
            source: pageInfo?.page_name || "Unknown",
            product: pageInfo?.product_name || null,
            last_message: (msgs || [])[((msgs || []).length) - 1]?.content?.substring(0, 200),
            status: "new",
            organization_id: conv.organization_id,
            remark,
          });
          if (insertError) {
            if (isDuplicateLeadInsertError(insertError)) console.log("Skip DB-blocked duplicate lead (complain backfill):", foundPhone);
            else throw insertError;
          } else {
            created++;
          }
        }
        const tags = conv.tags || [];
        if (!tags.includes("lead-created")) {
          await supabase.from("conversations").update({
            tags: [...tags, "lead-created"],
            ai_followup_step: null,
            ai_followup_next_at: null,
          }).eq("id", conv.id);
        }
      }

      console.log(`Complain batch offset=${offset}: scanned=${scanned}, created=${created}`);
      if (convs.length === 200) {
        fetch(`${supabaseUrl}/functions/v1/backfill-leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ complainMode: true, _batchOffset: offset + 200, sinceDate: sinceCutoff }),
        }).catch(() => {});
      }
      return new Response(JSON.stringify({ success: true, scanned, created, offset }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === RESTORE MODE: recreate leads from conversations with lead-created tag but no lead ===

    if (restoreMode) {
      console.log(`Restore mode: offset=${offset}, dateFilter=${dateFilter || 'none'}`);
      
      // First get conversation IDs that already have leads to exclude them
      const { data: existingLeadConvs } = await supabase
        .from("leads")
        .select("conversation_id")
        .not("conversation_id", "is", null);
      
      const existingConvIds = new Set((existingLeadConvs || []).map((l: any) => l.conversation_id));
      
      let query = supabase
        .from("conversations")
        .select("id, participant_name, page_id, organization_id, tags")
        .contains("tags", ["lead-created"])
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(0, 999);

      if (dateFilter) {
        query = query.gte("created_at", dateFilter);
      }
      const { data: allTaggedConvs } = await query;

      // Filter out conversations that already have leads, limit to 30 per batch
      const taggedConvs = (allTaggedConvs || []).filter((c: any) => !existingConvIds.has(c.id)).slice(0, 30);
      const totalRemaining = (allTaggedConvs || []).filter((c: any) => !existingConvIds.has(c.id)).length;

      if (!taggedConvs || taggedConvs.length === 0) {
        const totalProcessed = existingConvIds.size;
        return new Response(JSON.stringify({ success: true, message: "Restore complete", totalLeads: totalProcessed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let created = 0, skipped = 0;

      for (const conv of taggedConvs) {
        // Check if lead already exists for this conversation
        const { data: existingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("conversation_id", conv.id)
          .maybeSingle();

        if (existingLead) { skipped++; continue; }

        // Get customer messages to extract phone and build remark
        const { data: msgs } = await supabase
          .from("messages")
          .select("content, sender_type")
          .eq("conversation_id", conv.id)
          .eq("sender_type", "customer")
          .order("created_at", { ascending: true });

        let foundPhone: string | null = null;
        const inquiryTexts: string[] = [];

        for (const msg of (msgs || [])) {
          const content = msg.content || "";
          if (!foundPhone) {
            const phone = extractPhoneNumber(content);
            if (phone) foundPhone = phone;
          }
          const stripped = content.replace(/[\s\-\(\)\.\+]/g, '');
          if (content.trim().length > 0 && !/^\d{9,}$/.test(stripped) && !content.includes("facebook.com") && !content.includes("fbcdn")) {
            inquiryTexts.push(content);
          }
        }

        // Check for duplicate phone in org (only if phone found)
        if (foundPhone) {
          const normalizedPhone = foundPhone.replace(/\D/g, '').slice(-10);
          const { data: dupLead } = await supabase
            .from("leads")
            .select("id")
            .eq("organization_id", conv.organization_id)
            .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
            .maybeSingle();

          if (dupLead) { skipped++; continue; }
        }

        const remark = inquiryTexts.length > 0 ? inquiryTexts.join(' | ').substring(0, 500) : "No Inquiry";

        const { data: pageInfo } = await supabase
          .from("connected_pages")
          .select("page_name, product_name")
          .eq("id", conv.page_id)
          .single();

        const lastMsg = (msgs || [])[(msgs || []).length - 1]?.content?.substring(0, 200);

        const { error: insertError } = await supabase.from("leads").insert({
          phone: foundPhone,
          full_name: conv.participant_name || "Unknown",
          conversation_id: conv.id,
          page_id: conv.page_id,
          source: pageInfo?.page_name || "Unknown",
          product: pageInfo?.product_name || null,
          last_message: lastMsg,
          status: "new",
          organization_id: conv.organization_id,
          remark,
        });
        if (insertError) {
          if (isDuplicateLeadInsertError(insertError)) {
            console.log("Skip DB-blocked duplicate lead (restore backfill):", foundPhone);
            skipped++;
          } else throw insertError;
        } else {
          created++;
        }
      }

      console.log(`Restore batch: created=${created}, skipped=${skipped}, remaining=${totalRemaining - created - skipped}`);

      // Trigger next batch if there are more remaining conversations
      if (totalRemaining > taggedConvs.length || created > 0) {
        fetch(`${supabaseUrl}/functions/v1/backfill-leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ restoreMode: true, dateFilter }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ success: true, created, skipped, remaining: totalRemaining - created - skipped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === NORMAL BACKFILL MODE ===

    // Use SQL to find only conversations that have customer messages with phone-like content
    const { data: convWithPhones, error: sqlErr } = await supabase.rpc(
      'backfill_find_phone_convs' as any,
      { _offset: offset, _limit: BATCH_SIZE }
    );

    if (sqlErr) {
      console.log("RPC not found, using direct query approach");
      const { data: phoneMessages } = await supabase
        .from("messages")
        .select("conversation_id, content")
        .eq("sender_type", "customer")
        .not("content", "like", "%facebook.com%")
        .not("content", "like", "%fbcdn%")
        .not("content", "like", "%scontent%")
        .like("content", "%9__________%")
        .order("created_at", { ascending: true })
        .range(offset, offset + 500 - 1);

      if (!phoneMessages || phoneMessages.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "Backfill complete" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Group by conversation, extract real phone numbers
      const convPhoneMap = new Map<string, string>();
      for (const msg of phoneMessages) {
        if (convPhoneMap.has(msg.conversation_id)) continue;
        const phone = extractPhoneNumber(msg.content || "");
        if (phone) convPhoneMap.set(msg.conversation_id, phone);
      }

      if (convPhoneMap.size === 0) {
        // No valid phones found, try next batch
        if (phoneMessages.length === 500) {
          fetch(`${supabaseUrl}/functions/v1/backfill-leads`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
            body: JSON.stringify({ _batchOffset: offset + 500 }),
          }).catch(() => {});
        }
        return new Response(JSON.stringify({ success: true, offset, noPhones: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const convIds = Array.from(convPhoneMap.keys());

      // Get conversation details
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, participant_name, page_id, organization_id, tags")
        .in("id", convIds)
        .is("deleted_at", null);

      let created = 0, existing = 0;

      for (const conv of (convs || [])) {
        if ((conv.tags || []).includes("lead-created")) continue;

        const foundPhone = convPhoneMap.get(conv.id)!;
        const normalizedPhone = foundPhone.replace(/\D/g, '').slice(-10);

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
          // Get all customer messages for remark
          const { data: msgs } = await supabase
            .from("messages")
            .select("content")
            .eq("conversation_id", conv.id)
            .eq("sender_type", "customer")
            .order("created_at", { ascending: true });

          const inquiryTexts = (msgs || [])
            .map((m: any) => m.content || "")
            .filter((t: string) => {
              const stripped = t.replace(/[\s\-\(\)\.\+]/g, '');
              return t.trim().length > 0 && !/^\d{9,}$/.test(stripped) && !t.includes("facebook.com") && !t.includes("fbcdn");
            });

          const remark = inquiryTexts.length > 0 ? inquiryTexts.join(' | ').substring(0, 500) : "No Inquiry";

          const { data: pageInfo } = await supabase
            .from("connected_pages")
            .select("page_name, product_name")
            .eq("id", conv.page_id)
            .single();

          const { error: insertError } = await supabase.from("leads").insert({
            phone: foundPhone,
            full_name: conv.participant_name || "Unknown",
            conversation_id: conv.id,
            page_id: conv.page_id,
            source: pageInfo?.page_name || "Unknown",
            product: pageInfo?.product_name || null,
            last_message: (msgs || [])[((msgs || []).length) - 1]?.content?.substring(0, 200),
            status: "new",
            organization_id: conv.organization_id,
            remark,
          });
          if (insertError) {
            if (isDuplicateLeadInsertError(insertError)) {
              console.log("Skip DB-blocked duplicate lead (normal backfill):", foundPhone);
              existing++;
            } else throw insertError;
          } else {
            created++;
          }
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

      console.log(`Backfill batch offset=${offset}: created=${created}, existing=${existing}`);

      if (phoneMessages.length === 500) {
        fetch(`${supabaseUrl}/functions/v1/backfill-leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ _batchOffset: offset + 500 }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ success: true, created, existing, offset }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Backfill error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
