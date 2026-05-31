import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AiFollowupStep {
  delay_hours?: number;
  message_hint: string;
  media?: { type: string; url: string } | null;
}

interface AiFollowupSettings {
  enabled: boolean;
  steps: AiFollowupStep[];
}

const MAX_STEPS = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const organization_id: string | undefined = body.organization_id;
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pages, error: pagesError } = await supabase
      .from("connected_pages")
      .select("id, page_id, page_name, page_access_token, ai_followup_settings, organization_id")
      .eq("organization_id", organization_id)
      .eq("connection_status", "active");

    if (pagesError) throw pagesError;

    const results: any[] = [];
    let totalSent = 0;

    for (const page of pages || []) {
      const settings = page.ai_followup_settings as AiFollowupSettings | null;
      if (!settings?.enabled || !settings.steps?.length) continue;

      const stepCount = Math.min(settings.steps.length, MAX_STEPS);

      // Process steps from highest to lowest so step N+1 doesn't fire on a conv that just got step N
      for (let stepIdx = stepCount - 1; stepIdx >= 0; stepIdx--) {
        const stepNum = stepIdx + 1; // 1-based
        const step = settings.steps[stepIdx];
        const text = (step.message_hint || "").trim();
        if (!text) continue;

        const requiredPrevTag = stepNum === 1 ? null : `followup-${stepNum - 1}`;
        const currentTag = `followup-${stepNum}`;

        // Fetch eligible conversations
        let query = supabase
          .from("conversations")
          .select("id, participant_id, tags")
          .eq("page_id", page.id)
          .is("deleted_at", null)
          .not("tags", "cs", `{lead-created}`)
          .not("tags", "cs", `{${currentTag}}`);

        if (requiredPrevTag) {
          query = query.contains("tags", [requiredPrevTag]);
        } else {
          // Step 1: must NOT already have any followup-N tag and must be unreplied (customer reply pending)
          query = query.eq("status", "unreplied");
          for (let n = 1; n <= MAX_STEPS; n++) {
            query = query.not("tags", "cs", `{followup-${n}}`);
          }
        }

        const { data: convs, error: convErr } = await query.limit(500);
        if (convErr) {
          console.error(`[step ${stepNum}] fetch error`, convErr);
          continue;
        }

        for (const conv of convs || []) {
          const tags: string[] = conv.tags || [];

          // Send via Facebook with HUMAN_AGENT tag (7-day window)
          const buildPayload = (withTag: boolean) => ({
            recipient: { id: conv.participant_id },
            message: { text },
            access_token: page.page_access_token,
            ...(withTag ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {}),
          });

          try {
            let resp = await fetch("https://graph.facebook.com/v19.0/me/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildPayload(true)),
            });

            if (!resp.ok) {
              const errPeek = await resp.clone().json().catch(() => ({}));
              const code = errPeek?.error?.code;
              if (code === 100 || code === 2018001 || code === 2018278) {
                resp = await fetch("https://graph.facebook.com/v19.0/me/messages", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(buildPayload(false)),
                });
              }
            }

            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              const msg = err?.error?.message || "fb_error";
              console.error(`[step ${stepNum}] FB error conv=${conv.id}:`, msg);
              results.push({ conv: conv.id, step: stepNum, status: "fb_error", error: String(msg).substring(0, 120) });
              continue;
            }

            // Save outgoing message
            await supabase.from("messages").insert({
              conversation_id: conv.id,
              content: text,
              sender_type: "page",
              message_type: "text",
              created_at: new Date().toISOString(),
            });

            // Log
            await supabase.from("followup_logs").insert({
              conversation_id: conv.id,
              page_id: page.id,
              organization_id: page.organization_id,
              followup_type: "scheduled",
              step_number: stepNum,
              message_text: text,
            });

            // Optional media
            if (step.media?.url) {
              const mediaPayload: any = step.media.type === "image"
                ? { attachment: { type: "image", payload: { url: step.media.url, is_reusable: true } } }
                : step.media.type === "video"
                ? { attachment: { type: "video", payload: { url: step.media.url, is_reusable: true } } }
                : { attachment: { type: "template", payload: { template_type: "button", text: "🔗", buttons: [{ type: "web_url", url: step.media.url, title: "Open" }] } } };

              await fetch("https://graph.facebook.com/v19.0/me/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipient: { id: conv.participant_id },
                  message: mediaPayload,
                  access_token: page.page_access_token,
                  messaging_type: "MESSAGE_TAG",
                  tag: "HUMAN_AGENT",
                }),
              }).catch((e) => console.warn("media send failed", e));
            }

            // Update conversation: add followup-N tag, refresh preview
            const newTags = Array.from(new Set([...tags, currentTag]));
            await supabase.from("conversations").update({
              tags: newTags,
              last_message_preview: text.substring(0, 100),
              last_message_at: new Date().toISOString(),
              status: "replied",
              ai_fail_reason: null,
            }).eq("id", conv.id);

            totalSent++;
            results.push({ conv: conv.id, step: stepNum, status: "sent" });

            // jitter to avoid FB rate limits
            await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[step ${stepNum}] send exception conv=${conv.id}:`, msg);
            results.push({ conv: conv.id, step: stepNum, status: "error", error: msg.substring(0, 120) });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sent: totalSent, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-followup fatal:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
