import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Handle webhook verification (GET request from Facebook)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    // Get verify token from settings
    const { data: settings } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "webhook_verify_token")
      .single();

    const verifyToken = settings?.setting_value || "socialbox_verify_token";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    } else {
      return new Response("Forbidden", { status: 403 });
    }
  }

  // Handle incoming webhook events (POST request)
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Webhook received:", JSON.stringify(body));

      if (body.object !== "page") {
        return new Response("Not a page event", { status: 200 });
      }

      // Process each entry
      for (const entry of body.entry || []) {
        const pageId = entry.id;

        // Find the connected page in our database
        const { data: page } = await supabase
          .from("connected_pages")
          .select("id, page_id, page_access_token")
          .eq("page_id", pageId)
          .eq("connection_status", "active")
          .single();

        if (!page) {
          console.log("Page not found or inactive:", pageId);
          continue;
        }

        // Process messaging events
        for (const messaging of entry.messaging || []) {
          const senderId = messaging.sender?.id;
          const recipientId = messaging.recipient?.id;
          const timestamp = messaging.timestamp;
          const message = messaging.message;

          if (!message || senderId === pageId) {
            // Skip if no message or if message is from the page itself
            continue;
          }

        // Find or create conversation
        let conversationId: string;
        let conversationTags: string[] = [];
        
        const { data: existingConv } = await supabase
          .from("conversations")
          .select("id, status, tags")
          .eq("page_id", page.id)
          .eq("participant_id", senderId)
          .single();

        if (!existingConv) {
          // Fetch sender info from Facebook
          let senderName = "Unknown";
          try {
            const userResponse = await fetch(
              `https://graph.facebook.com/v19.0/${senderId}?fields=name,profile_pic&access_token=${page.page_access_token}`
            );
            if (userResponse.ok) {
              const userData = await userResponse.json();
              senderName = userData.name || "Unknown";
            }
          } catch (e) {
            console.error("Failed to fetch sender info:", e);
          }

          // Create new conversation
          const { data: newConv, error: convError } = await supabase
            .from("conversations")
            .insert({
              external_conversation_id: `${pageId}_${senderId}`,
              page_id: page.id,
              participant_id: senderId,
              participant_name: senderName,
              status: "unreplied",
              last_message_at: new Date(timestamp).toISOString(),
              last_message_preview: message.text?.substring(0, 100),
            })
            .select("id, tags")
            .single();

          if (convError || !newConv) {
            console.error("Error creating conversation:", convError);
            continue;
          }
          conversationId = newConv.id;
          conversationTags = newConv.tags || [];
        } else {
          conversationId = existingConv.id;
          conversationTags = existingConv.tags || [];
        }

        // Store the message
        const { error: msgError } = await supabase
          .from("messages")
          .insert({
            external_message_id: message.mid,
            conversation_id: conversationId,
            content: message.text,
            sender_type: "customer",
            message_type: message.attachments ? "media" : "text",
            media_url: message.attachments?.[0]?.payload?.url,
            created_at: new Date(timestamp).toISOString(),
          });

        if (msgError) {
          console.error("Error storing message:", msgError);
        }

        // Update conversation
        await supabase
          .from("conversations")
          .update({
            last_message_at: new Date(timestamp).toISOString(),
            last_message_preview: message.text?.substring(0, 100),
            status: "unreplied",
          })
          .eq("id", conversationId);

        // Check for phone number and create/update lead
        const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
        const phoneMatches = message.text?.match(phoneRegex);

        if (phoneMatches && phoneMatches.length > 0) {
          const phone = phoneMatches[0].replace(/[-.\s()]/g, "");

          // Check if lead exists
          const { data: existingLead } = await supabase
            .from("leads")
            .select("id")
            .eq("phone", phone)
            .single();

          if (existingLead) {
            // Update existing lead
            await supabase
              .from("leads")
              .update({
                conversation_id: conversationId,
                last_message: message.text?.substring(0, 200),
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingLead.id);
          } else {
            // Fetch participant name
            const { data: conv } = await supabase
              .from("conversations")
              .select("participant_name")
              .eq("id", conversationId)
              .single();

            // Create new lead
            await supabase
              .from("leads")
              .insert({
                phone: phone,
                full_name: conv?.participant_name,
                conversation_id: conversationId,
                page_id: page.id,
                last_message: message.text?.substring(0, 200),
                status: "new",
              });
          }

          // Add lead-created tag to conversation
          if (!conversationTags.includes("lead-created")) {
            await supabase
              .from("conversations")
              .update({
                tags: [...conversationTags, "lead-created"],
              })
              .eq("id", conversationId);
          }
        }
        }
      }

      return new Response("EVENT_RECEIVED", { status: 200 });
    } catch (error) {
      console.error("Webhook processing error:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
