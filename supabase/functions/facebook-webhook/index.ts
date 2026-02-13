import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract any phone number with 9-13 digits from text
function extractPhoneNumber(text: string): string | null {
  if (!text) return null;
  
  // Remove common separators and try to find 9-13 digit sequences
  // First try with country code prefix patterns
  const withCountryCode = text.match(/\+?\d{1,4}[\s-]?\d{4,13}/g);
  if (withCountryCode) {
    for (const match of withCountryCode) {
      const digits = match.replace(/[\s\-\+]/g, '');
      if (digits.length >= 9 && digits.length <= 13) {
        return digits;
      }
    }
  }
  
  // Then try plain digit sequences
  const plainDigits = text.match(/\b(\d{9,13})\b/g);
  if (plainDigits && plainDigits.length > 0) {
    return plainDigits[0];
  }
  
  return null;
}

interface KeywordRule {
  keywords: string[];
  reply: string;
  media?: MediaAttachment;
  enabled?: boolean;
}

interface KeywordMatch {
  reply: string;
  media?: MediaAttachment;
}

function checkKeywordMatch(text: string, keywords: KeywordRule[]): KeywordMatch | null {
  if (!text || !keywords || keywords.length === 0) return null;
  
  const lowerText = text.toLowerCase();
  for (const rule of keywords) {
    // Skip disabled rules
    if (rule.enabled === false) continue;
    
    for (const keyword of rule.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return {
          reply: rule.reply,
          media: rule.media
        };
      }
    }
  }
  return null;
}

// Check if a message is just emoji, sticker reaction, or nonsense (single word like "ok", "hmm", thumbs up)
function isEmojiOrNonsense(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  
  // Remove all emoji characters and see if anything meaningful remains
  const withoutEmoji = trimmed.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
  
  // Pure emoji message
  if (withoutEmoji.length === 0) return true;
  
  // Very short nonsense responses (1-2 chars or common filler words)
  const nonsensePatterns = /^(ok|k|hmm+|hm+|oh|ah|ha+|haha+|lol|yes|no|ya|ho|👍|okay|oho|aha|thik|thx|ty|bye|👋|🙏|❤️|♥️|😊|😂|🤣|😍|huss|hus)$/i;
  if (nonsensePatterns.test(trimmed)) return true;
  
  // Messages shorter than 3 characters (excluding spaces)
  if (withoutEmoji.length <= 2) return true;
  
  return false;
}

interface MediaAttachment {
  type: "image" | "video" | "link";
  url: string;
}

interface MessagePayload {
  text?: string;
  media?: MediaAttachment;
}

function parseMessageContent(content: string): MessagePayload {
  // Try to parse as JSON (new format with media)
  try {
    const parsed = JSON.parse(content);
    if (parsed.text !== undefined) {
      return parsed;
    }
  } catch {
    // Not JSON, treat as plain text
  }
  return { text: content };
}

async function sendAutoReply(
  pageAccessToken: string, 
  recipientId: string, 
  messageContent: string,
  media?: MediaAttachment | null
): Promise<boolean> {
  try {
    // Parse message content to check for embedded media
    const parsed = parseMessageContent(messageContent);
    const textMessage = parsed.text || messageContent;
    const mediaToSend = media || parsed.media;

    // Send text message first
    if (textMessage) {
      const textResponse = await fetch(
        `https://graph.facebook.com/v19.0/me/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: textMessage },
            access_token: pageAccessToken,
          }),
        }
      );
      
      if (!textResponse.ok) {
        const err = await textResponse.json();
        console.error("Auto-reply text failed:", err);
        return false;
      }
      console.log("Auto-reply text sent successfully to", recipientId);
    }

    // Send media if present
    if (mediaToSend && mediaToSend.url) {
      let mediaPayload: any;
      
      if (mediaToSend.type === "image") {
        mediaPayload = {
          attachment: {
            type: "image",
            payload: { url: mediaToSend.url, is_reusable: true }
          }
        };
      } else if (mediaToSend.type === "video") {
        mediaPayload = {
          attachment: {
            type: "video",
            payload: { url: mediaToSend.url, is_reusable: true }
          }
        };
      } else if (mediaToSend.type === "link") {
        // For links, send as a button template
        mediaPayload = {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: "🔗 Link:",
              buttons: [{
                type: "web_url",
                url: mediaToSend.url,
                title: "Open Link"
              }]
            }
          }
        };
      }

      if (mediaPayload) {
        const mediaResponse = await fetch(
          `https://graph.facebook.com/v19.0/me/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: recipientId },
              message: mediaPayload,
              access_token: pageAccessToken,
            }),
          }
        );
        
        if (!mediaResponse.ok) {
          const err = await mediaResponse.json();
          console.error("Auto-reply media failed:", err);
          // Don't fail completely if media fails, text was sent
        } else {
          console.log("Auto-reply media sent successfully to", recipientId);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error("Auto-reply error:", error);
    return false;
  }
}

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

    // Use env variable for verify token
    const verifyToken = Deno.env.get("FACEBOOK_WEBHOOK_VERIFY_TOKEN") || "socialbox_verify_token";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    } else {
      console.log("Webhook verification failed - token mismatch, expected:", verifyToken, "got:", token);
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
        const { data: page, error: pageError } = await supabase
          .from("connected_pages")
          .select("id, page_id, page_name, page_access_token, automation_enabled, ai_enabled, ai_description, auto_reply_first_message, auto_reply_followup, auto_reply_keywords, product_name, ai_followup_settings")
          .eq("page_id", pageId)
          .eq("connection_status", "active")
          .single();

        if (pageError || !page) {
          console.log("Page not found or inactive:", pageId, pageError);
          continue;
        }

        console.log("Processing messages for page:", page.page_id, "automation_enabled:", page.automation_enabled);

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

          console.log("Processing message from:", senderId, "content:", message.text?.substring(0, 50));

          // Find or create conversation
          let conversationId: string;
          let conversationTags: string[] = [];
          let isFirstMessage = false;
          
          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id, status, tags")
            .eq("page_id", page.id)
            .eq("participant_id", senderId)
            .single();

          if (!existingConv) {
            isFirstMessage = true;
            
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
              // If duplicate key error, find existing conversation by external_conversation_id
              if (convError?.code === "23505") {
                console.log("Conversation already exists, finding by external_conversation_id");
                const { data: existingByExtId } = await supabase
                  .from("conversations")
                  .select("id, tags")
                  .eq("external_conversation_id", `${pageId}_${senderId}`)
                  .single();
                
                if (existingByExtId) {
                  conversationId = existingByExtId.id;
                  conversationTags = existingByExtId.tags || [];
                  
                  // Update participant_id if missing
                  await supabase
                    .from("conversations")
                    .update({ participant_id: senderId })
                    .eq("id", conversationId)
                    .is("participant_id", null);
                } else {
                  console.error("Could not find conversation even by external_id");
                  continue;
                }
              } else {
                console.error("Error creating conversation:", convError);
                continue;
              }
            } else {
              conversationId = newConv.id;
              conversationTags = newConv.tags || [];
            }
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

          // Check for phone number (9-13 digits) and create lead
          const detectedPhone = extractPhoneNumber(message.text || "");
          if (detectedPhone) {
            console.log("Phone number detected:", detectedPhone);
            
            // Check if lead with this phone already exists
            const { data: existingLead } = await supabase
              .from("leads")
              .select("id")
              .eq("phone", detectedPhone)
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
              console.log("Updated existing lead:", existingLead.id);
            } else {
              // Fetch participant name
              const { data: conv } = await supabase
                .from("conversations")
                .select("participant_name")
                .eq("id", conversationId)
                .single();

              // Create new lead with page name as source and product
              const { error: leadError } = await supabase
                .from("leads")
                .insert({
                  phone: detectedPhone,
                  full_name: conv?.participant_name,
                  conversation_id: conversationId,
                  page_id: page.id,
                  source: page.page_name,
                  product: (page as any).product_name || null,
                  last_message: message.text?.substring(0, 200),
                  status: "new",
                });

              if (leadError) {
                console.error("Error creating lead:", leadError);
              } else {
                console.log("Created new lead for phone:", detectedPhone);
              }
            }

            // Add lead-created tag to conversation
            if (!conversationTags.includes("lead-created")) {
              await supabase
                .from("conversations")
                .update({
                  tags: [...conversationTags, "lead-created"],
                })
                .eq("id", conversationId);
              conversationTags = [...conversationTags, "lead-created"];
            }
          }

          // AI reply logic (only if AI is enabled and automation is NOT enabled)
          if (page.ai_enabled && !page.automation_enabled) {
            console.log("AI enabled for page, checking if reply needed");
            
            // Customer replied - reset follow-up timer (they're engaged)
            const followupSettings = (page as any).ai_followup_settings;
            if (followupSettings?.enabled && followupSettings.steps?.length > 0) {
              // Reset to step 0 with fresh delay from first step
              const firstStep = followupSettings.steps[0];
              await supabase.from("conversations").update({
                ai_followup_step: 0,
                ai_followup_next_at: new Date(Date.now() + firstStep.delay_hours * 60 * 60 * 1000).toISOString(),
              }).eq("id", conversationId);
            }
            
            // Check if message is just emoji or nonsense after lead is already created
            const isNonsenseOrEmoji = isEmojiOrNonsense(message.text || "");
            const hasLeadTag = conversationTags.includes("lead-created");
            
            if (hasLeadTag && isNonsenseOrEmoji) {
              console.log("Skipping AI reply - lead already created and message is emoji/nonsense:", message.text);
            } else {
              // Wait 7 seconds to batch multiple incoming messages
              console.log("Waiting 7 seconds to batch messages...");
              await new Promise(resolve => setTimeout(resolve, 7000));
              
              try {
                // Get recent conversation history for context
                const { data: recentMessages } = await supabase
                  .from("messages")
                  .select("content, sender_type, created_at")
                  .eq("conversation_id", conversationId)
                  .order("created_at", { ascending: false })
                  .limit(15);

                // Check if there's already a page reply after the latest customer messages
                // (another webhook instance may have already replied)
                const latestMessages = (recentMessages || []).reverse();
                const lastPageReplyIndex = latestMessages.map(m => m.sender_type).lastIndexOf('page');
                const lastCustomerIndex = latestMessages.map(m => m.sender_type).lastIndexOf('customer');
                
                if (lastPageReplyIndex > lastCustomerIndex) {
                  console.log("Already replied to latest messages, skipping");
                } else {
                  // Collect all unreplied customer messages
                  const unrepliedCustomerMessages: string[] = [];
                  for (let i = latestMessages.length - 1; i >= 0; i--) {
                    if (latestMessages[i].sender_type === 'customer') {
                      if (latestMessages[i].content) unrepliedCustomerMessages.unshift(latestMessages[i].content!);
                    } else {
                      break; // stop at last page reply
                    }
                  }

                  const combinedCustomerMessage = unrepliedCustomerMessages.join('\n');
                  
                  // If all unreplied messages are emoji/nonsense after lead created, skip
                  const allNonsense = hasLeadTag && unrepliedCustomerMessages.every(m => isEmojiOrNonsense(m));
                  if (allNonsense) {
                    console.log("All unreplied messages are emoji/nonsense after lead created, skipping");
                  } else {
                    const conversationHistory = latestMessages
                      .map(m => `${m.sender_type === 'customer' ? 'Customer' : 'Business'}: ${m.content}`)
                      .join('\n');

                    // Call ai-reply edge function
                    const aiResponse = await fetch(
                      `${supabaseUrl}/functions/v1/ai-reply`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${supabaseKey}`,
                        },
                        body: JSON.stringify({
                          conversationId,
                          customerMessage: combinedCustomerMessage,
                          conversationHistory,
                          pageName: page.page_name,
                          businessDescription: page.ai_description || "",
                        }),
                      }
                    );

                    if (aiResponse.ok) {
                      const aiData = await aiResponse.json();
                      const suggestedReply = aiData.suggestedReply;

                      if (suggestedReply) {
                        console.log("AI reply generated:", suggestedReply.substring(0, 50));
                        
                        const sent = await sendAutoReply(page.page_access_token, senderId, suggestedReply);
                        
                        if (sent) {
                          await supabase
                            .from("messages")
                            .insert({
                              conversation_id: conversationId,
                              content: suggestedReply,
                              sender_type: "page",
                              message_type: "text",
                              created_at: new Date().toISOString(),
                            });

                          await supabase
                            .from("conversations")
                            .update({
                              status: "replied",
                              last_message_preview: suggestedReply.substring(0, 100),
                              last_message_at: new Date().toISOString(),
                            })
                            .eq("id", conversationId);
                            
                        console.log("AI reply sent and saved");
                        
                        // Start AI follow-up tracking if no lead yet
                        if (!hasLeadTag) {
                          const followupSettings = (page as any).ai_followup_settings;
                          if (followupSettings?.enabled && followupSettings.steps?.length > 0) {
                            const firstStep = followupSettings.steps[0];
                            const nextAt = new Date(Date.now() + firstStep.delay_hours * 60 * 60 * 1000).toISOString();
                            await supabase.from("conversations").update({
                              ai_followup_step: 0,
                              ai_followup_next_at: nextAt,
                            }).eq("id", conversationId);
                            console.log("AI follow-up tracking started, first follow-up at:", nextAt);
                          }
                        }
                      }
                    }
                  } else {
                    console.error("AI reply function error:", aiResponse.status, await aiResponse.text());
                  }
                }
              }
            } catch (aiError) {
              console.error("AI reply error:", aiError);
            }
          }
        }
          
          // Auto-reply logic (only if automation is enabled for this page)
          else if (page.automation_enabled) {
            console.log("Automation enabled, checking auto-reply rules");
            
            let autoReplyMessage: string | null = null;
            let autoReplyMedia: MediaAttachment | undefined = undefined;
            let autoReplyType: string | null = null;

            // Check keyword-based replies first
            const keywordMatch = checkKeywordMatch(
              message.text || "",
              (page.auto_reply_keywords as KeywordRule[]) || []
            );
            
            if (keywordMatch) {
              autoReplyMessage = keywordMatch.reply;
              autoReplyMedia = keywordMatch.media;
              autoReplyType = "keyword";
            } else if (isFirstMessage && page.auto_reply_first_message) {
              // First message auto-reply
              autoReplyMessage = page.auto_reply_first_message;
              autoReplyType = "first_message";
            } else if (!isFirstMessage && page.auto_reply_followup) {
              // Follow-up auto-reply (enabled now)
              autoReplyMessage = page.auto_reply_followup;
              autoReplyType = "followup";
            }

            if (autoReplyMessage) {
              const parsed = parseMessageContent(autoReplyMessage);
              const logText = parsed.text || autoReplyMessage;
              console.log(`Sending ${autoReplyType} auto-reply:`, logText.substring(0, 50));
              
              const sent = await sendAutoReply(page.page_access_token, senderId, autoReplyMessage, autoReplyMedia);
              
              if (sent) {
                await supabase
                  .from("messages")
                  .insert({
                    conversation_id: conversationId,
                    content: parsed.text || autoReplyMessage,
                    sender_type: "page",
                    message_type: autoReplyMedia ? "media" : "text",
                    media_url: autoReplyMedia?.url || parsed.media?.url,
                    created_at: new Date().toISOString(),
                  });

                await supabase
                  .from("conversations")
                  .update({
                    status: "replied",
                    last_message_preview: (parsed.text || autoReplyMessage).substring(0, 100),
                    last_message_at: new Date().toISOString(),
                  })
                  .eq("id", conversationId);
                  
                console.log("Auto-reply saved to database");
              }
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
