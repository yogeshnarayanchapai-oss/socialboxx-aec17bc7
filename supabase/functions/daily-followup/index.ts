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
      .select("id, page_id, page_name, page_access_token, ai_enabled, ai_description, ai_followup_settings, product_name, product_description")
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

      console.log(`Processing follow-ups for page: ${page.page_name}`);

      // Get conversations due for follow-up
      const { data: dueConversations, error: convError } = await supabase
        .from("conversations")
        .select("id, participant_id, participant_name, ai_followup_step, tags, last_message_at")
        .eq("page_id", page.id)
        .not("ai_followup_step", "is", null)
        .lte("ai_followup_next_at", now.toISOString())
        .is("deleted_at", null);

      if (convError) {
        console.error("Error fetching conversations:", convError);
        continue;
      }

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

        // Skip if all steps exhausted
        if (currentStep >= followupSettings.steps.length) {
          console.log(`Skipping conv ${conv.id} - all follow-up steps done`);
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
          console.log(`AI follow-up step ${currentStep + 1} already sent for conv ${conv.id}`);
          const nextStep = currentStep + 1;
          const nextStepConfig = followupSettings.steps[nextStep];
          await supabase.from("conversations").update({
            ai_followup_step: nextStep,
            ai_followup_next_at: nextStepConfig
              ? new Date(Date.now() + nextStepConfig.delay_hours * 60 * 60 * 1000).toISOString()
              : null,
          }).eq("id", conv.id);
          continue;
        }

        const step = followupSettings.steps[currentStep];
        console.log(`Sending follow-up #${currentStep + 1} for conv ${conv.id}: ${step.message_hint}`);

        try {
          // Generate AI follow-up message
          let followupMessage = step.message_hint;

          if (LOVABLE_API_KEY) {
            const { data: recentMsgs } = await supabase
              .from("messages")
              .select("content, sender_type")
              .eq("conversation_id", conv.id)
              .order("created_at", { ascending: false })
              .limit(10);

            const history = (recentMsgs || []).reverse()
              .map(m => `${m.sender_type === 'customer' ? 'Customer' : 'Business'}: ${m.content}`)
              .join('\n');

            const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  {
                    role: "system",
                    content: `You are a follow-up message assistant for "${page.page_name}".
${page.ai_description ? `Business info: ${page.ai_description}` : ''}
${page.product_name ? `Product: ${page.product_name}` : ''}
${page.product_description ? `Product details: ${page.product_description}` : ''}

LANGUAGE RULE: Match the customer's language (Nepali देवनागरी, Roman Nepali, or English).

This is follow-up #${currentStep + 1} of ${followupSettings.steps.length}.
Goal: "${step.message_hint}"
${step.media?.url ? `Include this link naturally: ${step.media.url}` : ''}

Guidelines:
- Sound natural and human-like, NOT robotic
- Keep it short (1-3 sentences)
- Be friendly but not pushy
- Reference previous conversation context
- Don't repeat exact same words from previous follow-ups
- If sharing a link, introduce it naturally`
                  },
                  {
                    role: "user",
                    content: `Previous conversation:\n${history}\n\nCustomer name: ${conv.participant_name || 'Customer'}\nGenerate the follow-up message:`
                  },
                ],
                max_tokens: 300,
                temperature: 0.8,
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              followupMessage = aiData.choices?.[0]?.message?.content?.trim() || followupMessage;
            }
          }

          // Send via Facebook
          const sendResponse = await fetch(
            `https://graph.facebook.com/v19.0/me/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: conv.participant_id },
                message: { text: followupMessage },
                access_token: page.page_access_token,
              }),
            }
          );

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
              organization_id: (await supabase.from("connected_pages").select("organization_id").eq("id", page.id).single()).data?.organization_id,
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
              ai_followup_step: nextStep,
              ai_followup_next_at: nextStepConfig
                ? new Date(Date.now() + nextStepConfig.delay_hours * 60 * 60 * 1000).toISOString()
                : null,
              last_message_preview: followupMessage.substring(0, 100),
              last_message_at: new Date().toISOString(),
            }).eq("id", conv.id);

            results.push({ convId: conv.id, page: page.page_name, step: currentStep + 1, status: "sent" });
            console.log(`Follow-up #${currentStep + 1} sent for conv ${conv.id}`);
          } else {
            const err = await sendResponse.json();
            console.error("Facebook send error:", err);
            results.push({ convId: conv.id, step: currentStep + 1, status: "error", error: err.error?.message });
          }
        } catch (error) {
          console.error(`Error processing conv ${conv.id}:`, error);
          results.push({ convId: conv.id, step: currentStep + 1, status: "error", error: String(error) });
        }

        // Human-like delay between messages
        const delay = Math.random() * 10000 + 5000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

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
