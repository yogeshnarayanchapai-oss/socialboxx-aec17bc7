import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AiFollowupStep {
  delay_hours: number;
  message_hint: string;
  media?: { type: string; url: string } | null;
}

interface AiFollowupSettings {
  enabled: boolean;
  steps: AiFollowupStep[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();

    // Get all pages with AI follow-up enabled
    const { data: pages, error: pagesError } = await supabase
      .from("connected_pages")
      .select("id, page_id, page_name, page_access_token, ai_enabled, ai_description, ai_instructions, ai_followup_settings, product_name, product_description, organization_id")
      .eq("ai_enabled", true)
      .eq("connection_status", "active");

    if (pagesError) {
      console.error("Error fetching pages:", pagesError);
      throw pagesError;
    }

    const results: any[] = [];

    for (const page of pages || []) {
      const followupSettings = page.ai_followup_settings as AiFollowupSettings | null;
      if (!followupSettings?.enabled || !followupSettings.steps?.length) {
        continue;
      }

      console.log(`Processing AI follow-ups for page: ${page.page_name}, ${followupSettings.steps.length} steps configured`);

      // Get conversations due for follow-up
      const { data: dueConversations, error: convError } = await supabase
        .from("conversations")
        .select("id, participant_id, participant_name, ai_followup_step, tags, last_message_at, status")
        .eq("page_id", page.id)
        .not("ai_followup_step", "is", null)
        .lte("ai_followup_next_at", now.toISOString())
        .is("deleted_at", null);

      if (convError) {
        console.error("Error fetching conversations:", convError);
        continue;
      }

      console.log(`Found ${(dueConversations || []).length} due conversations for page: ${page.page_name}`);

      for (const conv of dueConversations || []) {
        const currentStep = conv.ai_followup_step || 0;
        const tags = conv.tags || [];

        // Skip if lead already created (they gave phone number)
        if (tags.includes("lead-created")) {
          console.log(`Skipping conv ${conv.id} - lead already created`);
          await supabase.from("conversations").update({
            ai_followup_step: null,
            ai_followup_next_at: null,
          }).eq("id", conv.id);
          continue;
        }

        // Skip if conversation is completed/closed
        if (conv.status === "completed") {
          console.log(`Skipping conv ${conv.id} - conversation completed`);
          await supabase.from("conversations").update({
            ai_followup_step: null,
            ai_followup_next_at: null,
          }).eq("id", conv.id);
          continue;
        }

        // Skip if all steps exhausted
        if (currentStep >= followupSettings.steps.length) {
          console.log(`Skipping conv ${conv.id} - all ${followupSettings.steps.length} follow-up steps done`);
          await supabase.from("conversations").update({
            ai_followup_step: null,
            ai_followup_next_at: null,
          }).eq("id", conv.id);
          continue;
        }

        // Check duplicate
        const { data: existingLog } = await supabase
          .from("followup_logs")
          .select("id")
          .eq("conversation_id", conv.id)
          .eq("followup_type", "ai")
          .eq("step_number", currentStep + 1)
          .single();

        if (existingLog) {
          console.log(`AI follow-up step ${currentStep + 1} already sent for conv ${conv.id}, advancing`);
          const nextStep = currentStep + 1;
          const nextStepConfig = followupSettings.steps[nextStep];
          await supabase.from("conversations").update({
            ai_followup_step: nextStepConfig ? nextStep : null,
            ai_followup_next_at: nextStepConfig
              ? new Date(Date.now() + nextStepConfig.delay_hours * 60 * 60 * 1000).toISOString()
              : null,
          }).eq("id", conv.id);
          continue;
        }

        const step = followupSettings.steps[currentStep];
        const followupMessage = (step.message_hint || "").trim();

        if (!followupMessage) {
          console.warn(`Skipping conv ${conv.id} - step ${currentStep + 1} has empty template text`);
          const nextStep = currentStep + 1;
          const nextStepConfig = followupSettings.steps[nextStep];
          await supabase.from("conversations").update({
            ai_followup_step: nextStepConfig ? nextStep : null,
            ai_followup_next_at: nextStepConfig
              ? new Date(Date.now() + nextStepConfig.delay_hours * 60 * 60 * 1000).toISOString()
              : null,
          }).eq("id", conv.id);
          continue;
        }

        console.log(`Sending follow-up #${currentStep + 1} for conv ${conv.id} (verbatim template)`);

        // Send via Facebook — use HUMAN_AGENT tag to bypass 24-hour window (up to 7 days)
        const buildPayload = (withTag: boolean) => ({
          recipient: { id: conv.participant_id },
          message: { text: followupMessage },
          access_token: page.page_access_token,
          ...(withTag ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" } : {}),
        });

        try {
          let sendResponse = await fetch(
            `https://graph.facebook.com/v19.0/me/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildPayload(true)),
            }
          );

          // Fallback: if HUMAN_AGENT tag is not accepted, retry without tag
          if (!sendResponse.ok) {
            const errPeek = await sendResponse.clone().json().catch(() => ({}));
            const code = errPeek?.error?.code;
            if (code === 100 || code === 2018001 || code === 2018278) {
              sendResponse = await fetch(
                `https://graph.facebook.com/v19.0/me/messages`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(buildPayload(false)),
                }
              );
            }
          }

          if (sendResponse.ok) {
            // Save message
            await supabase.from("messages").insert({
              conversation_id: conv.id,
              content: followupMessage,
              sender_type: "page",
              message_type: "text",
              created_at: new Date().toISOString(),
            });

            // Log the follow-up
            await supabase.from("followup_logs").insert({
              conversation_id: conv.id,
              page_id: page.id,
              organization_id: page.organization_id,
              followup_type: "ai",
              step_number: currentStep + 1,
              message_text: followupMessage,
            });

            // Send media if present
            if (step.media?.url) {
              const mediaPayload: any = step.media.type === "image"
                ? { attachment: { type: "image", payload: { url: step.media.url, is_reusable: true } } }
                : step.media.type === "video"
                ? { attachment: { type: "video", payload: { url: step.media.url, is_reusable: true } } }
                : { attachment: { type: "template", payload: { template_type: "button", text: "🔗", buttons: [{ type: "web_url", url: step.media.url, title: "Open" }] } } };

              await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipient: { id: conv.participant_id },
                  message: mediaPayload,
                  access_token: page.page_access_token,
                }),
              });
            }

            // Update conversation: move to next step
            const nextStep = currentStep + 1;
            const nextStepConfig = followupSettings.steps[nextStep];

            await supabase.from("conversations").update({
              ai_followup_step: nextStepConfig ? nextStep : null,
              ai_followup_next_at: nextStepConfig
                ? new Date(Date.now() + nextStepConfig.delay_hours * 60 * 60 * 1000).toISOString()
                : null,
              last_message_preview: followupMessage.substring(0, 100),
              last_message_at: new Date().toISOString(),
              status: "replied",
              ai_fail_reason: null,
            }).eq("id", conv.id);

            results.push({ convId: conv.id, page: page.page_name, step: currentStep + 1, status: "sent" });
            console.log(`Follow-up #${currentStep + 1} sent for conv ${conv.id}`);
          } else {
            const err = await sendResponse.json();
            const errMsg = err.error?.message || JSON.stringify(err).substring(0, 100);
            console.error("Facebook send error:", errMsg);
            
            // Mark as ai_failed but keep followup step for retry
            const fbFailTags: string[] = conv.tags || [];
            if (!fbFailTags.includes("FOLLOW-UP")) fbFailTags.push("FOLLOW-UP");
            await supabase.from("conversations").update({
              status: "ai_failed",
              ai_fail_reason: `Followup #${currentStep + 1} Facebook send failed: ${errMsg}`.substring(0, 200),
              ai_followup_next_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
              tags: fbFailTags,
            }).eq("id", conv.id);
            
            results.push({ convId: conv.id, step: currentStep + 1, status: "fb_error", error: errMsg });
          }
        } catch (sendError) {
          const reason = sendError instanceof Error ? sendError.message : String(sendError);
          console.error(`Send error for conv ${conv.id}:`, reason);
          
          const sendFailTags: string[] = conv.tags || [];
          if (!sendFailTags.includes("FOLLOW-UP")) sendFailTags.push("FOLLOW-UP");
          await supabase.from("conversations").update({
            status: "ai_failed",
            ai_fail_reason: `Followup #${currentStep + 1} send error: ${reason}`.substring(0, 200),
            ai_followup_next_at: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(),
            tags: sendFailTags,
          }).eq("id", conv.id);
          
          results.push({ convId: conv.id, step: currentStep + 1, status: "error", error: reason });
        }

        // Short delay between messages (1-2s) to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 1000));
      }
    }

    console.log(`AI follow-up processing complete. Processed: ${results.length}`);
    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Daily follow-up error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
