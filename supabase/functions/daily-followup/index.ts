import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get follow-up settings
    const { data: settings } = await supabase
      .from("app_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["followup_template", "human_mode_enabled", "min_delay", "max_delay", "business_hours_start", "business_hours_end"]);

    const settingsMap = Object.fromEntries(
      (settings || []).map(s => [s.setting_key, s.setting_value])
    );

    // Check business hours
    const now = new Date();
    const currentHour = now.getHours();
    const startHour = parseInt(settingsMap.business_hours_start || "9");
    const endHour = parseInt(settingsMap.business_hours_end || "18");

    if (currentHour < startHour || currentHour >= endHour) {
      return new Response(
        JSON.stringify({ success: true, message: "Outside business hours, skipping follow-ups" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get leads with follow-up due
    const { data: leadsToFollowUp, error: leadsError } = await supabase
      .from("leads")
      .select(`
        id,
        full_name,
        phone,
        conversation_id,
        last_message,
        page_id,
        conversations!inner(
          id,
          participant_id,
          page_id,
          connected_pages!inner(
            page_access_token,
            page_id
          )
        )
      `)
      .eq("status", "follow_up")
      .lte("followup_due_date", now.toISOString())
      .not("status", "eq", "closed");

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      throw leadsError;
    }

    // Get follow-up template
    const { data: template } = await supabase
      .from("reply_templates")
      .select("content")
      .eq("category", "followup")
      .eq("is_active", true)
      .limit(1)
      .single();

    const followupTemplate = template?.content || 
      "Hi {{name}}, just following up on our conversation. Is there anything else I can help you with?";

    const results = [];
    const minDelay = parseInt(settingsMap.min_delay || "15") * 1000;
    const maxDelay = parseInt(settingsMap.max_delay || "90") * 1000;

    for (const lead of leadsToFollowUp || []) {
      try {
        // Generate personalized message using template
        let message = followupTemplate
          .replace(/\{\{name\}\}/g, lead.full_name || "there")
          .replace(/\{\{phone\}\}/g, lead.phone || "");

        // If AI is available, generate a more personalized message
        if (LOVABLE_API_KEY) {
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { 
                  role: "system", 
                  content: "Generate a short, friendly follow-up message based on the template. Keep it under 100 words and natural." 
                },
                { 
                  role: "user", 
                  content: `Template: "${followupTemplate}"\nCustomer name: ${lead.full_name || "Customer"}\nLast message from them: "${lead.last_message || "No previous message"}"\n\nGenerate the follow-up message:` 
                },
              ],
              max_tokens: 200,
              temperature: 0.7,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            message = aiData.choices?.[0]?.message?.content || message;
          }
        }

        // Apply human-like delay
        if (settingsMap.human_mode_enabled !== false) {
          const delay = Math.random() * (maxDelay - minDelay) + minDelay;
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Send message via Facebook API
        const pageData = (lead as any).conversations?.connected_pages;
        if (pageData) {
          const sendResponse = await fetch(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${pageData.page_access_token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: (lead as any).conversations?.participant_id },
                message: { text: message },
              }),
            }
          );

          if (sendResponse.ok) {
            // Store message in database
            await supabase.from("messages").insert({
              conversation_id: lead.conversation_id,
              content: message,
              sender_type: "page",
              message_type: "text",
            });

            // Update lead - move to next follow-up or mark as done
            await supabase
              .from("leads")
              .update({
                followup_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Next day
                updated_at: new Date().toISOString(),
              })
              .eq("id", lead.id);

            results.push({ leadId: lead.id, status: "sent", message: message.substring(0, 50) });
          } else {
            const error = await sendResponse.json();
            results.push({ leadId: lead.id, status: "error", error: error.error?.message });
          }
        }
      } catch (error) {
        console.error(`Error processing lead ${lead.id}:`, error);
        results.push({ leadId: lead.id, status: "error", error: String(error) });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
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
