import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MediaAttachment {
  type: "image" | "video" | "link";
  url: string;
}

interface ReplyMessage {
  text: string;
  media?: MediaAttachment | null;
}

async function sendMessage(
  pageAccessToken: string,
  recipientId: string,
  text: string,
  media?: MediaAttachment | null
): Promise<boolean> {
  try {
    if (text) {
      const res = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          access_token: pageAccessToken,
        }),
      });
      if (!res.ok) {
        console.error("Send text failed:", await res.json());
        return false;
      }
    }

    if (media?.url) {
      let mediaPayload: any;
      if (media.type === "image") {
        mediaPayload = { attachment: { type: "image", payload: { url: media.url, is_reusable: true } } };
      } else if (media.type === "video") {
        mediaPayload = { attachment: { type: "video", payload: { url: media.url, is_reusable: true } } };
      } else if (media.type === "link") {
        mediaPayload = {
          attachment: {
            type: "template",
            payload: { template_type: "button", text: "🔗 Link:", buttons: [{ type: "web_url", url: media.url, title: "Open Link" }] },
          },
        };
      }
      if (mediaPayload) {
        await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: mediaPayload,
            access_token: pageAccessToken,
          }),
        });
      }
    }
    return true;
  } catch (error) {
    console.error("Send error:", error);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const results: any[] = [];

    // Get all pages with automation enabled
    const { data: pages, error: pagesError } = await supabase
      .from("connected_pages")
      .select("id, page_id, page_name, page_access_token, automation_enabled, auto_followup_messages")
      .eq("automation_enabled", true)
      .eq("connection_status", "active");

    if (pagesError) throw pagesError;

    for (const page of pages || []) {
      const followupMessages: ReplyMessage[] = Array.isArray(page.auto_followup_messages) 
        ? (page.auto_followup_messages as any[]).map((m: any) => ({ text: m.text || "", media: m.media || null }))
        : [];

      if (followupMessages.length === 0) continue;

      console.log(`Processing automation follow-ups for page: ${page.page_name}, ${followupMessages.length} steps`);

      // Get conversations due for automation follow-up
      const { data: dueConversations, error: convError } = await supabase
        .from("conversations")
        .select("id, participant_id, participant_name, auto_followup_step, tags")
        .eq("page_id", page.id)
        .not("auto_followup_step", "is", null)
        .lte("auto_followup_next_at", now.toISOString())
        .is("deleted_at", null);

      if (convError) {
        console.error("Error fetching conversations:", convError);
        continue;
      }

      for (const conv of dueConversations || []) {
        const currentStep = conv.auto_followup_step || 0;
        const tags = conv.tags || [];

        // Skip if lead already created
        if (tags.includes("lead-created")) {
          console.log(`Skipping conv ${conv.id} - lead already created`);
          await supabase.from("conversations").update({
            auto_followup_step: null,
            auto_followup_next_at: null,
          }).eq("id", conv.id);
          continue;
        }

        // Skip if all steps done
        if (currentStep >= followupMessages.length) {
          console.log(`Skipping conv ${conv.id} - all steps done`);
          await supabase.from("conversations").update({
            auto_followup_step: null,
            auto_followup_next_at: null,
          }).eq("id", conv.id);
          continue;
        }

        // Check if this step was already sent (prevent duplicates)
        const { data: existingLog } = await supabase
          .from("followup_logs")
          .select("id")
          .eq("conversation_id", conv.id)
          .eq("followup_type", "automation")
          .eq("step_number", currentStep + 1)
          .single();

        if (existingLog) {
          console.log(`Step ${currentStep + 1} already sent for conv ${conv.id}, advancing`);
          const nextStep = currentStep + 1;
          if (nextStep >= followupMessages.length) {
            await supabase.from("conversations").update({ auto_followup_step: null, auto_followup_next_at: null }).eq("id", conv.id);
          } else {
            // Default 24h between steps
            await supabase.from("conversations").update({
              auto_followup_step: nextStep,
              auto_followup_next_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }).eq("id", conv.id);
          }
          continue;
        }

        const step = followupMessages[currentStep];
        console.log(`Sending automation follow-up #${currentStep + 1} for conv ${conv.id}`);

        const sent = await sendMessage(page.page_access_token, conv.participant_id!, step.text, step.media);

        if (sent) {
          // Save message
          await supabase.from("messages").insert({
            conversation_id: conv.id,
            content: step.text,
            sender_type: "page",
            message_type: step.media ? "media" : "text",
            media_url: step.media?.url,
            created_at: new Date().toISOString(),
          });

          // Log the follow-up
          await supabase.from("followup_logs").insert({
            conversation_id: conv.id,
            page_id: page.id,
            organization_id: (await supabase.from("connected_pages").select("organization_id").eq("id", page.id).single()).data?.organization_id,
            followup_type: "automation",
            step_number: currentStep + 1,
            message_text: step.text,
          });

          // Advance to next step
          const nextStep = currentStep + 1;
          const nextStepExists = nextStep < followupMessages.length;

          await supabase.from("conversations").update({
            auto_followup_step: nextStepExists ? nextStep : null,
            auto_followup_next_at: nextStepExists ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
            last_message_preview: step.text.substring(0, 100),
            last_message_at: new Date().toISOString(),
          }).eq("id", conv.id);

          results.push({ convId: conv.id, page: page.page_name, step: currentStep + 1, status: "sent" });
        } else {
          results.push({ convId: conv.id, step: currentStep + 1, status: "error" });
        }

        // Human-like delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 8000 + 3000));
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Automation follow-up error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
