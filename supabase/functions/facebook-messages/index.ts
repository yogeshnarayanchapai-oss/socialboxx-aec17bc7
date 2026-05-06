import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Nepali digit conversion
function convertNepaliDigits(text: string): string {
  const nepaliDigits: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  };
  return text.replace(/[०-९]/g, (d) => nepaliDigits[d] || d);
}

function extractNepaliPhone(text: string): string | null {
  if (!text) return null;
  
  const converted = convertNepaliDigits(text);
  const digitGroups = converted.match(/\d+/g);
  if (!digitGroups) return null;
  
  let allDigits = digitGroups.join('');
  if (allDigits.length < 9) return null;
  
  if (allDigits.startsWith('977') && allDigits.length >= 12) {
    allDigits = allDigits.substring(3);
  }
  
  if (allDigits.startsWith('9') && allDigits.length >= 9) {
    return allDigits;
  }
  
  if (allDigits.length >= 9) return allDigits;
  return null;
}

async function checkAndCreateLead(
  supabase: any, 
  messageContent: string, 
  conversationId: string, 
  dbPageId: string, 
  pageName: string,
  participantName: string | null
) {
  const nepaliPhone = extractNepaliPhone(messageContent);
  if (!nepaliPhone) return;

  console.log("Nepali phone detected:", nepaliPhone);
  
  // Check if lead with this phone already exists
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("phone", nepaliPhone)
    .maybeSingle();

  if (existingLead) {
    // Update existing lead
    await supabase
      .from("leads")
      .update({
        conversation_id: conversationId,
        last_message: messageContent.substring(0, 200),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingLead.id);
    console.log("Updated existing lead:", existingLead.id);
  } else {
    // Fetch recent customer messages to build remark
    const { data: recentMsgs } = await supabase
      .from("messages")
      .select("content, sender_type")
      .eq("conversation_id", conversationId)
      .eq("sender_type", "customer")
      .order("created_at", { ascending: false })
      .limit(10);

    let remark = "No Inquiry";
    if (recentMsgs && recentMsgs.length > 0) {
      const inquiryTexts = recentMsgs
        .map((m: any) => m.content || "")
        .filter((t: string) => {
          const stripped = t.replace(/[\s\-\(\)\.\+]/g, '');
          const isJustNumber = /^\d{9,}$/.test(stripped);
          return t.trim().length > 0 && !isJustNumber;
        })
        .reverse();
      
      if (inquiryTexts.length > 0) {
        remark = inquiryTexts.join(' | ').substring(0, 500);
      }
    }

    // Create new lead with page name as source
    const { error: leadError } = await supabase
      .from("leads")
      .insert({
        phone: nepaliPhone,
        full_name: participantName,
        conversation_id: conversationId,
        page_id: dbPageId,
        source: pageName,
        last_message: messageContent.substring(0, 200),
        status: "new",
        remark: remark,
      });

    if (leadError) {
      console.error("Error creating lead:", leadError);
    } else {
      console.log("Created new lead for phone:", nepaliPhone, "source:", pageName, "remark:", remark);
    }
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const isServiceRole = token === supabaseKey;
    const isAnonKey = anonKey && token === anonKey;

    let userId: string | null = null;
    if (!isServiceRole && !isAnonKey) {
      // Prefer JWT claims (no DB lookup, more reliable)
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (!claimsError && claimsData?.claims?.sub) {
        userId = claimsData.claims.sub as string;
      } else {
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
          throw new Error("Unauthorized");
        }
        userId = user.id;
      }
    }

    const { action, pageId, conversationId, recipientId, message, mediaUrl } = await req.json();

    // Get page access token from DB
    const { data: page, error: pageError } = await supabase
      .from("connected_pages")
      .select("page_access_token, page_id, page_name, id")
      .eq("id", pageId)
      .single();

    if (pageError || !page) {
      console.error("Page not found error:", pageError);
      throw new Error("Page not found. Make sure the page is connected.");
    }

    const pageAccessToken = page.page_access_token;
    const fbPageId = page.page_id;
    const dbPageId = page.id;

    console.log(`[${action}] Processing for page: ${page.page_name} (${fbPageId})`);

    if (action === "fetch_conversations") {
      // STEP 1: Validate token first
      console.log("Step 1: Validating page access token...");
      const tokenCheckUrl = `https://graph.facebook.com/v19.0/${fbPageId}?fields=id,name&access_token=${pageAccessToken}`;
      console.log("Token check URL:", tokenCheckUrl.replace(pageAccessToken, "TOKEN_HIDDEN"));
      
      const tokenCheckResponse = await fetch(tokenCheckUrl);
      const tokenCheckData = await tokenCheckResponse.json();
      
      if (!tokenCheckResponse.ok) {
        console.error("Token validation failed:", JSON.stringify(tokenCheckData));
        
        await supabase
          .from("connected_pages")
          .update({ connection_status: "token_expired" })
          .eq("id", dbPageId);
        
        const errorMsg = tokenCheckData.error?.message || "Token validation failed";
        if (errorMsg.includes("expired")) {
          throw new Error("Page access token has expired. Please reconnect the page.");
        } else if (errorMsg.includes("permission")) {
          throw new Error("Missing required permissions. Please reconnect with pages_messaging permission.");
        }
        throw new Error(`Token error: ${errorMsg}`);
      }
      
      console.log("Token valid for page:", tokenCheckData.name);

      // STEP 2: Fetch conversations with retry for transient errors
      console.log("Step 2: Fetching conversations...");
      const conversationsUrl = `https://graph.facebook.com/v19.0/${fbPageId}/conversations?fields=id,updated_time,participants&limit=50&access_token=${pageAccessToken}`;
      console.log("Conversations URL:", conversationsUrl.replace(pageAccessToken, "TOKEN_HIDDEN"));
      
      let conversationsData: any = null;
      let lastError: string = "";
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const conversationsResponse = await fetch(conversationsUrl);
        conversationsData = await conversationsResponse.json();
        
        console.log(`Conversations API Response (attempt ${attempt}):`, conversationsResponse.status);

        if (conversationsResponse.ok) {
          break; // Success, exit retry loop
        }
        
        console.error(`Attempt ${attempt} failed:`, JSON.stringify(conversationsData));
        lastError = conversationsData.error?.message || "Failed to fetch conversations";
        
        // Check for permanent errors - don't retry
        if (conversationsData.error?.code === 190) {
          throw new Error("Access token is invalid or expired. Please reconnect the page.");
        } else if (conversationsData.error?.code === 10 || conversationsData.error?.code === 200) {
          throw new Error("Missing required permissions. Make sure pages_messaging and pages_read_engagement are granted.");
        }
        
        // For transient errors (code 2), retry with exponential backoff
        if (conversationsData.error?.is_transient && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`Transient error, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Non-transient error or max retries reached
        if (attempt === maxRetries) {
          throw new Error(`Facebook API temporarily unavailable. Please try again in a few minutes. (${lastError})`);
        }
      }
      
      if (!conversationsData?.data) {
        throw new Error(`Facebook API Error: ${lastError || "No data returned"}`);
      }

      const conversations = conversationsData.data || [];
      console.log(`Found ${conversations.length} conversations from Facebook API`);

      if (conversations.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            conversations: 0,
            messages: 0,
            note: "No conversations found. This page might not have any messages yet."
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let syncedConversations = 0;
      let syncedMessages = 0;
      const errors: string[] = [];

      // STEP 3: Process each conversation
      for (const conv of conversations) {
        try {
          console.log(`Processing conversation: ${conv.id}`);
          
          // Find the participant (not the page itself)
          const participant = conv.participants?.data?.find(
            (p: any) => p.id !== fbPageId
          );
          
          console.log(`Participant: ${participant?.name || "Unknown"} (${participant?.id || "no-id"})`);

          // Insert or update conversation in DB
          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id")
            .eq("external_conversation_id", conv.id)
            .maybeSingle();

          let dbConversationId: string;

          if (existingConv) {
            // Update existing
            const { error: updateError } = await supabase
              .from("conversations")
              .update({
                participant_id: participant?.id,
                participant_name: participant?.name || "Facebook User",
                last_message_at: conv.updated_time,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingConv.id);
            
            if (updateError) {
              console.error("Update conversation error:", updateError);
              errors.push(`Update conv ${conv.id}: ${updateError.message}`);
              continue;
            }
            dbConversationId = existingConv.id;
            console.log(`Updated existing conversation: ${dbConversationId}`);
          } else {
            // Insert new
            const { data: newConv, error: insertError } = await supabase
              .from("conversations")
              .insert({
                external_conversation_id: conv.id,
                page_id: dbPageId,
                participant_id: participant?.id,
                participant_name: participant?.name || "Facebook User",
                last_message_at: conv.updated_time,
                status: "unreplied",
              })
              .select("id")
              .single();
            
            if (insertError) {
              console.error("Insert conversation error:", insertError);
              errors.push(`Insert conv ${conv.id}: ${insertError.message}`);
              continue;
            }
            dbConversationId = newConv.id;
            console.log(`Inserted new conversation: ${dbConversationId}`);
          }

          syncedConversations++;

          // STEP 4: Fetch messages for this conversation
          console.log(`Fetching messages for conversation: ${conv.id}`);
          const messagesUrl = `https://graph.facebook.com/v19.0/${conv.id}/messages?fields=message,from,created_time&limit=50&access_token=${pageAccessToken}`;
          
          const messagesResponse = await fetch(messagesUrl);
          const messagesData = await messagesResponse.json();

          if (!messagesResponse.ok) {
            console.error(`Failed to fetch messages for ${conv.id}:`, JSON.stringify(messagesData));
            errors.push(`Fetch messages ${conv.id}: ${messagesData.error?.message || "Unknown error"}`);
            continue;
          }

          const messages = messagesData.data || [];
          console.log(`Found ${messages.length} messages for conversation ${conv.id}`);

          let lastMessagePreview: string | null = null;

          // STEP 5: Save messages to DB and check for leads
          for (const msg of messages) {
            const isFromPage = msg.from?.id === fbPageId;
            const messageContent = msg.message || "";
            
            if (!lastMessagePreview && messageContent) {
              lastMessagePreview = messageContent.substring(0, 100);
            }

            // Check for Nepali phone number and create lead (only for customer messages)
            // Do this for ALL messages, not just new ones
            if (!isFromPage && messageContent) {
              await checkAndCreateLead(
                supabase, 
                messageContent, 
                dbConversationId, 
                dbPageId, 
                page.page_name,
                participant?.name || null
              );
            }

            // Check if message exists
            const { data: existingMsg } = await supabase
              .from("messages")
              .select("id")
              .eq("external_message_id", msg.id)
              .maybeSingle();

            if (existingMsg) {
              // Message already exists, skip saving
              continue;
            }

            const { error: msgInsertError } = await supabase
              .from("messages")
              .insert({
                external_message_id: msg.id,
                conversation_id: dbConversationId,
                content: messageContent,
                sender_type: isFromPage ? "page" : "customer",
                created_at: msg.created_time,
              });

            if (msgInsertError) {
              console.error(`Insert message error for ${msg.id}:`, msgInsertError);
              continue;
            }
            
            syncedMessages++;
          }

          // Update conversation with last message preview
          if (lastMessagePreview) {
            await supabase
              .from("conversations")
              .update({ last_message_preview: lastMessagePreview })
              .eq("id", dbConversationId);
          }

        } catch (convError) {
          console.error(`Error processing conversation ${conv.id}:`, convError);
          errors.push(`Process conv ${conv.id}: ${convError instanceof Error ? convError.message : "Unknown"}`);
        }
      }

      console.log(`Sync complete. Conversations: ${syncedConversations}, Messages: ${syncedMessages}`);
      if (errors.length > 0) {
        console.log("Errors during sync:", errors);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          conversations: syncedConversations,
          messages: syncedMessages,
          errors: errors.length > 0 ? errors : undefined,
        }),
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

      // Only call FB Graph if external_conversation_id is a real FB thread id (e.g. "t_xxx").
      // Webhook-created conversations use "{pageId}_{senderId}" which is NOT a valid FB node.
      const extId = conv.external_conversation_id || "";
      const isRealFbThread = extId.startsWith("t_");

      if (isRealFbThread) {
        const response = await fetch(
          `https://graph.facebook.com/v19.0/${extId}/messages?fields=id,message,from,created_time,attachments&limit=50&access_token=${pageAccessToken}`
        );

        if (response.ok) {
          const data = await response.json();
          const messages = data.data || [];

          for (const msg of messages) {
            const isFromPage = msg.from?.id === fbPageId;
            const { data: existingMsg } = await supabase
              .from("messages")
              .select("id")
              .eq("external_message_id", msg.id)
              .maybeSingle();

            if (!existingMsg) {
              await supabase
                .from("messages")
                .insert({
                  external_message_id: msg.id,
                  conversation_id: conversationId,
                  content: msg.message || "",
                  sender_type: isFromPage ? "page" : "customer",
                  created_at: msg.created_time,
                  media_url: msg.attachments?.data?.[0]?.image_data?.url || 
                            msg.attachments?.data?.[0]?.file_url || null,
                });
            }
          }
        } else {
          const error = await response.json();
          console.warn("FB fetch_messages failed, returning DB messages only:", error?.error?.message);
        }
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
      const messagePayload: any = {
        recipient: { id: recipientId },
        message: {}
      };

      if (mediaUrl) {
        messagePayload.message.attachment = {
          type: "image",
          payload: { url: mediaUrl, is_reusable: true }
        };
      } else {
        messagePayload.message.text = message;
      }

      let response = await fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messagePayload),
        }
      );

      // If outside 24h window, retry with HUMAN_AGENT tag (7-day window, requires approved Human Agent permission)
      if (!response.ok) {
        try {
          const errPeek = await response.clone().json();
          const subcode = errPeek?.error?.error_subcode;
          const msgL = String(errPeek?.error?.message || "").toLowerCase();
          if (subcode === 2018278 || msgL.includes("outside") && msgL.includes("window")) {
            console.log("Outside 24h window, retrying with HUMAN_AGENT tag...");
            response = await fetch(
              `https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...messagePayload, messaging_type: "HUMAN_AGENT" }),
              }
            );
          }
        } catch (_) { /* ignore */ }
      }

      if (!response.ok) {
        const error = await response.json();
        console.error("Failed to send message:", error);
        const fbMsg = String(error.error?.message || "");
        throw new Error(fbMsg || "Failed to send message");
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
          sent_by: userId,
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
          ai_fail_reason: null,
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
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
