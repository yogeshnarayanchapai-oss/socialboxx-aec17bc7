import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { action, pageId, conversationId, recipientId, message, mediaUrl } = await req.json();

    // Get page access token
    const { data: page, error: pageError } = await supabase
      .from("connected_pages")
      .select("page_access_token, page_id")
      .eq("id", pageId)
      .single();

    if (pageError || !page) {
      throw new Error("Page not found");
    }

    if (action === "fetch_conversations") {
      // Fetch conversations from Facebook
      console.log("Fetching conversations for page:", page.page_id);
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${page.page_id}/conversations?fields=id,participants,updated_time,messages.limit(1){message,from,created_time}&access_token=${page.page_access_token}`
      );

      if (!response.ok) {
        const error = await response.json();
        console.error("Facebook API error:", error);
        throw new Error(error.error?.message || "Failed to fetch conversations. Check token permissions.");
      }

      const data = await response.json();
      const conversations = data.data || [];
      console.log("Found conversations:", conversations.length);

      // Sync conversations to database
      for (const conv of conversations) {
        const participant = conv.participants?.data?.find(
          (p: any) => p.id !== page.page_id
        );
        const lastMessage = conv.messages?.data?.[0];

        console.log("Syncing conversation:", conv.id, "participant:", participant?.name);

        const { error: upsertError } = await supabase
          .from("conversations")
          .upsert({
            external_conversation_id: conv.id,
            page_id: pageId,
            participant_id: participant?.id,
            participant_name: participant?.name || "Unknown",
            last_message_at: conv.updated_time,
            last_message_preview: lastMessage?.message?.substring(0, 100),
            status: "unreplied",
          }, { onConflict: "external_conversation_id" });

        if (upsertError) {
          console.error("Upsert error:", upsertError);
        }

        // Also fetch and save messages for this conversation
        const messagesResponse = await fetch(
          `https://graph.facebook.com/v19.0/${conv.id}/messages?fields=id,message,from,created_time,attachments&limit=25&access_token=${page.page_access_token}`
        );

        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          const messages = messagesData.data || [];
          console.log("Fetched messages for conversation:", conv.id, "count:", messages.length);

          // Get the conversation ID from our database
          const { data: dbConv } = await supabase
            .from("conversations")
            .select("id")
            .eq("external_conversation_id", conv.id)
            .single();

          if (dbConv) {
            for (const msg of messages) {
              const isFromPage = msg.from?.id === page.page_id;
              
              await supabase
                .from("messages")
                .upsert({
                  external_message_id: msg.id,
                  conversation_id: dbConv.id,
                  content: msg.message || "",
                  sender_type: isFromPage ? "page" : "customer",
                  created_at: msg.created_time,
                  media_url: msg.attachments?.data?.[0]?.image_data?.url || null,
                }, { onConflict: "external_message_id" });
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, count: conversations.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "fetch_messages") {
      // Get conversation external ID
      const { data: conv } = await supabase
        .from("conversations")
        .select("external_conversation_id")
        .eq("id", conversationId)
        .single();

      if (!conv) throw new Error("Conversation not found");

      const response = await fetch(
        `https://graph.facebook.com/v19.0/${conv.external_conversation_id}/messages?fields=id,message,from,created_time,attachments&limit=50&access_token=${page.page_access_token}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to fetch messages");
      }

      const data = await response.json();
      const messages = data.data || [];

      // Sync messages to database
      for (const msg of messages) {
        const isFromPage = msg.from?.id === page.page_id;
        
        await supabase
          .from("messages")
          .upsert({
            external_message_id: msg.id,
            conversation_id: conversationId,
            content: msg.message,
            sender_type: isFromPage ? "page" : "customer",
            created_at: msg.created_time,
            media_url: msg.attachments?.data?.[0]?.image_data?.url || null,
          }, { onConflict: "external_message_id" });
      }

      // Fetch synced messages from DB
      const { data: dbMessages } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      return new Response(
        JSON.stringify({ success: true, messages: dbMessages }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send_message") {
      // Send message via Facebook Graph API
      const body: any = { message };
      if (mediaUrl) {
        body.attachment = {
          type: "image",
          payload: { url: mediaUrl, is_reusable: true }
        };
      }

      const response = await fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${page.page_access_token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: mediaUrl ? body.attachment : { text: message },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to send message");
      }

      const result = await response.json();

      // Store sent message in database
      const { data: sentMessage, error: insertError } = await supabase
        .from("messages")
        .insert({
          external_message_id: result.message_id,
          conversation_id: conversationId,
          content: message,
          sender_type: "page",
          sent_by: user.id,
          media_url: mediaUrl,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Update conversation last message
      await supabase
        .from("conversations")
        .update({
          last_message_preview: message?.substring(0, 100),
          last_message_at: new Date().toISOString(),
          status: "replied",
        })
        .eq("id", conversationId);

      return new Response(
        JSON.stringify({ success: true, message: sentMessage }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Facebook messages error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
