import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Nepali digit conversion
function convertNepaliDigits(text: string): string {
  const nepaliDigits: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  };
  return text.replace(/[०-९]/g, (d) => nepaliDigits[d] || d);
}

// Strip attachment markers and URLs so their digits don't get parsed as phone numbers
function sanitizeForPhoneExtraction(text: string): string {
  if (!text) return "";
  let t = text;
  // Remove our own attachment marker lines like "[Customer sent ... attachment: https://...]"
  t = t.replace(/\[Customer sent[^\]]*\]/gi, " ");
  t = t.replace(/\[(Sticker|Attachment)[^\]]*\]/gi, " ");
  // Remove any URLs (http/https/www) - their query strings contain huge digit blobs
  t = t.replace(/https?:\/\/\S+/gi, " ");
  t = t.replace(/www\.\S+/gi, " ");
  return t;
}

// Pick the best phone-like digit group instead of concatenating ALL digit runs
function pickPhoneDigits(text: string): string | null {
  const converted = convertNepaliDigits(text);
  const groups = converted.match(/\d[\d\s\-]{7,}\d/g);
  if (!groups) return null;
  // Try each candidate; prefer ones starting with 9 and ~10 digits
  const candidates = groups
    .map(g => g.replace(/\D/g, ''))
    .filter(d => d.length >= 9 && d.length <= 13);
  if (candidates.length === 0) return null;
  // Prefer Nepal mobile (starts with 9, 10 digits) or 977 + 10
  const nepal = candidates.find(d => d.length === 10 && d.startsWith('9'));
  if (nepal) return nepal;
  const nepalCC = candidates.find(d => d.startsWith('977') && d.length === 13);
  if (nepalCC) return nepalCC;
  // Otherwise pick the shortest valid candidate (avoid long IDs)
  candidates.sort((a, b) => a.length - b.length);
  return candidates[0];
}

// Phone number extraction - ignores URLs/attachments and picks a real phone group
function extractPhoneNumber(text: string): string | null {
  if (!text) return null;
  const cleaned = sanitizeForPhoneExtraction(text);
  const digits = pickPhoneDigits(cleaned);
  if (!digits) return null;
  
  if (digits.startsWith('977') && digits.length >= 12) {
    const local = digits.substring(3);
    if (local.startsWith('9') && local.length === 10) return local;
    return '+' + digits;
  }
  if (digits.startsWith('9') && digits.length === 10) return digits;
  if (digits.length >= 9 && digits.length <= 11) return digits;
  return null;
}

// Extract normalized phone for dedup - returns last 10 digits for matching
function extractNormalizedPhone(text: string): string | null {
  const raw = extractPhoneNumber(text);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
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
    if (rule.enabled === false) continue;
    for (const keyword of rule.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return { reply: rule.reply, media: rule.media };
      }
    }
  }
  return null;
}

function isEmojiOrNonsense(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  
  // Stickers are emoji/nonsense
  if (trimmed === '[Sticker]') return true;
  
  const withoutEmoji = trimmed.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
  
  if (withoutEmoji.length === 0) return true;
  
  const nonsensePatterns = /^(ok|k|hmm+|hm+|oh|ah|ha+|haha+|lol|yes|no|ya|ho|👍|okay|oho|aha|thik|thx|ty|bye|👋|🙏|❤️|♥️|😊|😂|🤣|😍|huss|hus)$/i;
  if (nonsensePatterns.test(trimmed)) return true;
  
  if (withoutEmoji.length <= 2) return true;
  
  return false;
}

interface MediaAttachment {
  type: "image" | "video" | "audio" | "link";
  url: string;
}

interface MessagePayload {
  text?: string;
  media?: MediaAttachment;
}

function parseMessageContent(content: string): MessagePayload {
  try {
    const parsed = JSON.parse(content);
    if (parsed.text !== undefined) return parsed;
  } catch {}
  return { text: content };
}

async function sendAutoReply(
  pageAccessToken: string, 
  recipientId: string, 
  messageContent: string,
  media?: MediaAttachment | null
): Promise<boolean | "permanent_fail"> {
  try {
    const parsed = parseMessageContent(messageContent);
    const textMessage = parsed.text || messageContent;
    const mediaToSend = media || parsed.media;

    if (textMessage) {
      let textResponse = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: textMessage },
          access_token: pageAccessToken,
        }),
      });
      // If outside 24h window, retry with HUMAN_AGENT tag (7-day window)
      if (!textResponse.ok) {
        try {
          const errPeek = await textResponse.clone().json();
          const subcode = errPeek?.error?.error_subcode;
          const msgL = String(errPeek?.error?.message || "").toLowerCase();
          if (subcode === 2018278 || msgL.includes("outside of allowed window") || msgL.includes("outside the allowed window")) {
            console.log("Outside-window detected, retrying with HUMAN_AGENT tag");
            textResponse = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text: textMessage },
                messaging_type: "MESSAGE_TAG",
                tag: "HUMAN_AGENT",
                access_token: pageAccessToken,
              }),
            });
          }
        } catch (_) { /* ignore */ }
      }
      if (!textResponse.ok) {
        const errBody = await textResponse.json();
        const fbCode = errBody?.error?.code;
        console.error("Auto-reply text failed:", errBody);
        const fbMessage = String(errBody?.error?.message || '').toLowerCase();
        const isPermanentUnavailable = fbCode === 551 || fbMessage.includes('person not available') || fbMessage.includes('user unavailable') || fbMessage.includes('blocked or deactivated');
        if (isPermanentUnavailable) {
          return "permanent_fail";
        }
        return false;
      }
    }

    if (mediaToSend?.url) {
      let mediaPayload: any;
      if (mediaToSend.type === "image") {
        mediaPayload = { attachment: { type: "image", payload: { url: mediaToSend.url, is_reusable: true } } };
      } else if (mediaToSend.type === "video") {
        // Send video as a clickable link (button template) instead of native video attachment
        mediaPayload = { attachment: { type: "template", payload: { template_type: "button", text: "🎥 Video herna tala ko link ma click garnuhos:", buttons: [{ type: "web_url", url: mediaToSend.url, title: "Video Hernuhos" }] } } };
      } else if (mediaToSend.type === "audio") {
        // For audio, upload to FB first to get an attachment_id so it plays inline
        // as a native voice message instead of being shown as a downloadable file.
        let audioAttachmentId: string | null = null;
        try {
          const uploadRes = await fetch(`https://graph.facebook.com/v19.0/me/message_attachments?access_token=${encodeURIComponent(pageAccessToken)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: { attachment: { type: "audio", payload: { is_reusable: true, url: mediaToSend.url } } },
            }),
          });
          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            audioAttachmentId = uploadJson?.attachment_id || null;
            console.log("Audio attachment uploaded, id:", audioAttachmentId);
          } else {
            console.error("Audio attachment upload failed:", await uploadRes.text());
          }
        } catch (e) {
          console.error("Audio attachment upload error:", e);
        }
        if (audioAttachmentId) {
          mediaPayload = { attachment: { type: "audio", payload: { attachment_id: audioAttachmentId } } };
        } else {
          // Fallback to direct URL send
          mediaPayload = { attachment: { type: "audio", payload: { url: mediaToSend.url, is_reusable: true } } };
        }
      } else if (mediaToSend.type === "link") {
        mediaPayload = { attachment: { type: "template", payload: { template_type: "button", text: "🔗 Link:", buttons: [{ type: "web_url", url: mediaToSend.url, title: "Open Link" }] } } };
      }
      if (mediaPayload) {
        let mResp = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: mediaPayload,
            access_token: pageAccessToken,
          }),
        });
        if (!mResp.ok) {
          try {
            const errPeek = await mResp.clone().json();
            const subcode = errPeek?.error?.error_subcode;
            const msgL = String(errPeek?.error?.message || "").toLowerCase();
            if (subcode === 2018278 || msgL.includes("outside of allowed window") || msgL.includes("outside the allowed window")) {
              mResp = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipient: { id: recipientId },
                  message: mediaPayload,
                  messaging_type: "MESSAGE_TAG",
                  tag: "HUMAN_AGENT",
                  access_token: pageAccessToken,
                }),
              });
            }
          } catch (_) {}
        }
        if (!mResp.ok) {
          const errBody = await mResp.text();
          console.error("Auto-reply media failed:", errBody);
          return false;
        }
      }
    }
    return true;
  } catch (error) {
    console.error("Auto-reply error:", error);
    return false;
  }
}

// Resolve medias[] from a template message, with fallback to legacy single `media`.
function resolveTemplateMedias(tmplMsg: any): MediaAttachment[] {
  if (tmplMsg && Array.isArray(tmplMsg.medias) && tmplMsg.medias.length > 0) {
    return tmplMsg.medias.filter((m: any) => m && m.type && m.url);
  }
  if (tmplMsg?.media?.url) return [tmplMsg.media];
  return [];
}

// Send a template message. If any image medias exist, all images go FIRST, then text,
// then any non-image medias (audio/video/link). Otherwise text first then media (legacy).
async function sendTemplateMessage(
  pageAccessToken: string,
  recipientId: string,
  text: string,
  medias: MediaAttachment[],
): Promise<boolean | "permanent_fail"> {
  const images = medias.filter(m => m.type === "image" && m.url);
  const others = medias.filter(m => m.type !== "image" && m.url);

  if (images.length === 0) {
    // No images — fallback to legacy single-media send (text first then optional media)
    return await sendAutoReply(pageAccessToken, recipientId, text || "", others[0] || null);
  }

  // 1) Send all images first (with delay to avoid FB throttling on rapid sends)
  for (let i = 0; i < images.length; i++) {
    const ok = await sendAutoReply(pageAccessToken, recipientId, "", images[i]);
    if (ok === "permanent_fail") return "permanent_fail";
    if (ok === false) return false;
    if (i < images.length - 1) await new Promise(r => setTimeout(r, 900));
  }
  // 2) Then text + first non-image media (if any)
  if (text || others.length > 0) {
    await new Promise(r => setTimeout(r, 900));
    const ok = await sendAutoReply(pageAccessToken, recipientId, text || "", others[0] || null);
    if (ok === "permanent_fail") return "permanent_fail";
    if (ok === false) return false;
  }
  // 3) Send remaining non-image medias one by one
  for (let i = 1; i < others.length; i++) {
    await new Promise(r => setTimeout(r, 900));
    const ok = await sendAutoReply(pageAccessToken, recipientId, "", others[i]);
    if (ok === "permanent_fail") return "permanent_fail";
    if (ok === false) return false;
  }
  return true;
}



// AI Comment Reply helper
async function handleCommentReply(
  supabase: any,
  page: any,
  commentId: string,
  commentText: string,
  postId: string,
  LOVABLE_API_KEY: string | undefined
): Promise<void> {
  if (!page.ai_comment_reply_enabled || !page.ai_enabled) return;
  
  console.log("AI comment reply enabled, generating reply for comment:", commentId);

  // Check if already replied
  const { data: existingLog } = await supabase
    .from("followup_logs")
    .select("id")
    .eq("followup_type", "ai_comment")
    .eq("message_text", commentId) // Store comment_id in message_text for tracking
    .single();

  if (existingLog) {
    console.log("Already replied to comment:", commentId);
    return;
  }

  let replyText = "धन्यवाद! कृपया हाम्रो inbox मा message गर्नुहोस् विस्तृत जानकारीको लागि।";

  if (LOVABLE_API_KEY) {
    try {
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
              content: `You are a comment reply assistant for "${page.page_name}".
${page.ai_description ? `Business info: ${page.ai_description}` : ''}
${page.product_name ? `Product: ${page.product_name}` : ''}
${(page as any).ai_comment_hint ? `\nComment Reply Hint: ${(page as any).ai_comment_hint}` : ''}
${(page as any).ai_instructions ? `\nInstructions: ${(page as any).ai_instructions}` : ''}

RULES:
- Match the customer's language (Nepali, Roman Nepali, or English)
- Keep it very short (1-2 sentences)
- Be friendly, professional
- Follow the hint/instructions if provided
- Don't share pricing details in comments unless instructed
- Sound natural and human-like`
            },
            {
              role: "user",
              content: `Customer commented: "${commentText}"\n\nGenerate a short, friendly reply comment:`
            },
          ],
          max_tokens: 150,
          temperature: 0.8,
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        replyText = aiData.choices?.[0]?.message?.content?.trim() || replyText;
      }
    } catch (e) {
      console.error("AI comment reply generation error:", e);
    }
  }

  // Post reply to Facebook comment
  try {
    const fbResponse = await fetch(
      `https://graph.facebook.com/v19.0/${commentId}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: replyText,
          access_token: page.page_access_token,
        }),
      }
    );

    if (fbResponse.ok) {
      console.log("AI comment reply posted successfully");
      
      // Log the reply
      await supabase.from("followup_logs").insert({
        conversation_id: null, // no conversation for comments
        page_id: page.id,
        followup_type: "ai_comment",
        step_number: 1,
        message_text: commentId, // store comment_id for dedup
      });
    } else {
      const err = await fbResponse.json();
      console.error("Failed to post comment reply:", err);
    }
  } catch (e) {
    console.error("Comment reply error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("FACEBOOK_WEBHOOK_VERIFY_TOKEN") || "socialbox_verify_token";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    } else {
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Webhook received:", JSON.stringify(body));

      if (body.object !== "page") {
        return new Response("Not a page event", { status: 200 });
      }

      for (const entry of body.entry || []) {
        const pageId = entry.id;

        const { data: page, error: pageError } = await supabase
          .from("connected_pages")
          .select("id, page_id, page_name, page_access_token, automation_enabled, ai_enabled, ai_description, ai_instructions, ai_comment_hint, auto_reply_first_message, auto_reply_followup, auto_reply_keywords, product_name, ai_followup_settings, ai_comment_reply_enabled, auto_followup_messages, organization_id, ai_debounce_seconds, ai_media_assets, first_msg_template_enabled, first_msg_template")
          .eq("page_id", pageId)
          .eq("connection_status", "active")
          .single();

        if (pageError || !page) {
          console.log("Page not found or inactive:", pageId, pageError);
          continue;
        }

        // Handle feed/comment events (for AI comment auto-reply)
        for (const change of entry.changes || []) {
          if (change.field === "feed" && change.value?.item === "comment" && change.value?.verb === "add") {
            const commentId = change.value.comment_id;
            const commentText = change.value.message || "";
            const postId = change.value.post_id || "";
            const senderId = change.value.from?.id;

            // Don't reply to own comments
            if (senderId === pageId) continue;

            await handleCommentReply(supabase, page, commentId, commentText, postId, LOVABLE_API_KEY);
          }
        }

        // Deduplicate: group messages by sender, keep only the LATEST per sender
        // This prevents sequential debounce sleeps that cause 504 timeouts
        const messagingEvents = entry.messaging || [];
        const latestPerSender = new Map<string, any>();
        for (const messaging of messagingEvents) {
          const sid = messaging.sender?.id;
          if (!sid || sid === pageId || !messaging.message) continue;
          const existing = latestPerSender.get(sid);
          if (!existing || (messaging.timestamp > existing.timestamp)) {
            latestPerSender.set(sid, messaging);
          }
        }

        // First pass: store ALL messages in DB (fast, no sleep)
        const storedMessages: Array<{messaging: any, conversationId: string, conversationTags: string[], isFirstMessage: boolean}> = [];
        
        for (const messaging of messagingEvents) {
          const senderId = messaging.sender?.id;
          const recipientId = messaging.recipient?.id;
          const timestamp = messaging.timestamp;
          const message = messaging.message;

          if (!message || senderId === pageId) continue;

          console.log("Processing message from:", senderId, "content:", message.text?.substring(0, 50));

          let conversationId: string;
          let conversationTags: string[] = [];
          let isFirstMessage = false;
          
          // Look for ANY conversation (including soft-deleted) to restore if needed
          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id, status, tags, participant_name, deleted_at")
            .eq("page_id", page.id)
            .eq("participant_id", senderId)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .single();

          // Auto-restore soft-deleted conversation when new message arrives
          // Delete old messages so conversation starts fresh from new message
          if (existingConv?.deleted_at) {
            console.log("Auto-restoring soft-deleted conversation:", existingConv.id);
            
            // Delete all old messages for this conversation
            const { error: deleteError } = await supabase
              .from("messages")
              .delete()
              .eq("conversation_id", existingConv.id);
            if (deleteError) {
              console.log("Error deleting old messages:", deleteError);
            } else {
              console.log("Old messages deleted for restored conversation:", existingConv.id);
            }
            
            // Restore conversation with fresh state
            await supabase.from("conversations").update({ 
              deleted_at: null, 
              status: "unreplied",
              tags: ["NEW"],
              auto_followup_step: null,
              auto_followup_next_at: null,
              ai_followup_step: null,
              ai_followup_next_at: null,
            }).eq("id", existingConv.id);

            // CRITICAL: Update in-memory tags to match DB reset
            existingConv.tags = ["NEW"];
          }

           if (!existingConv) {
            isFirstMessage = true;
            
            let senderName = "Unknown";
            let senderPicUrl: string | null = null;
            
            // Method 1: Try PSID-based lookup
            try {
              const userResponse = await fetch(
                `https://graph.facebook.com/v19.0/${senderId}?fields=first_name,last_name,profile_pic&access_token=${page.page_access_token}`
              );
              if (userResponse.ok) {
                const userData = await userResponse.json();
                const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(" ");
                senderName = fullName || "Unknown";
                senderPicUrl = userData.profile_pic || null;
                console.log("Fetched sender info via PSID:", senderName);
              } else {
                console.log("PSID lookup failed, trying Conversations API fallback...");
              }
            } catch (e) {
              console.log("PSID lookup error, trying fallback:", e);
            }

            // Method 2: Fallback - use Conversations API to get participant name
            if (senderName === "Unknown") {
              try {
                const convResponse = await fetch(
                  `https://graph.facebook.com/v19.0/${pageId}/conversations?fields=participants&user_id=${senderId}&access_token=${page.page_access_token}`
                );
                if (convResponse.ok) {
                  const convData = await convResponse.json();
                  const participants = convData.data?.[0]?.participants?.data;
                  if (participants) {
                    const sender = participants.find((p: any) => p.id === senderId);
                    if (sender?.name) {
                      senderName = sender.name;
                      console.log("Fetched sender name via Conversations API:", senderName);
                    }
                  }
                } else {
                  const errData = await convResponse.json();
                  console.error("Conversations API fallback failed:", JSON.stringify(errData));
                }
              } catch (e) {
                console.error("Conversations API fallback error:", e);
              }
            }

            const { data: newConv, error: convError } = await supabase
              .from("conversations")
              .insert({
                external_conversation_id: `${pageId}_${senderId}`,
                page_id: page.id,
                participant_id: senderId,
                participant_name: senderName,
                participant_picture_url: senderPicUrl,
                status: "unreplied",
                last_message_at: new Date(timestamp).toISOString(),
                last_message_preview: message.text?.substring(0, 100),
                organization_id: page.organization_id,
              })
              .select("id, tags")
              .single();

            if (convError || !newConv) {
              if (convError?.code === "23505") {
                const { data: existingByExtId } = await supabase
                  .from("conversations")
                  .select("id, tags")
                  .eq("external_conversation_id", `${pageId}_${senderId}`)
                  .single();
                
                if (existingByExtId) {
                  conversationId = existingByExtId.id;
                  conversationTags = existingByExtId.tags || [];
                  await supabase.from("conversations").update({ participant_id: senderId }).eq("id", conversationId).is("participant_id", null);
                } else continue;
              } else continue;
            } else {
              conversationId = newConv.id;
              conversationTags = newConv.tags || [];
            }
          } else {
            conversationId = existingConv.id;
            conversationTags = existingConv.tags || [];
            
            // If participant_name is Unknown, try to re-fetch from Facebook
            if (!existingConv.participant_name || existingConv.participant_name === "Unknown") {
              let updatedName: string | null = null;
              let updatedPic: string | null = null;

              // Try PSID lookup first
              try {
                const userResponse = await fetch(
                  `https://graph.facebook.com/v19.0/${senderId}?fields=first_name,last_name,profile_pic&access_token=${page.page_access_token}`
                );
                if (userResponse.ok) {
                  const userData = await userResponse.json();
                  const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(" ");
                  if (fullName) { updatedName = fullName; updatedPic = userData.profile_pic || null; }
                }
              } catch (_) {}

              // Fallback: Conversations API
              if (!updatedName) {
                try {
                  const convResponse = await fetch(
                    `https://graph.facebook.com/v19.0/${pageId}/conversations?fields=participants&user_id=${senderId}&access_token=${page.page_access_token}`
                  );
                  if (convResponse.ok) {
                    const convData = await convResponse.json();
                    const sender = convData.data?.[0]?.participants?.data?.find((p: any) => p.id === senderId);
                    if (sender?.name) updatedName = sender.name;
                  }
                } catch (_) {}
              }

              if (updatedName && updatedName !== "Unknown") {
                console.log("Updating Unknown participant to:", updatedName);
                await supabase.from("conversations").update({
                  participant_name: updatedName,
                  ...(updatedPic ? { participant_picture_url: updatedPic } : {}),
                }).eq("id", conversationId);
              }
            }
          }

          // Deduplicate: skip if this exact message was already processed (Facebook retry)
          const { data: existingMsg } = await supabase
            .from("messages")
            .select("id")
            .eq("external_message_id", message.mid)
            .limit(1);

          if (existingMsg && existingMsg.length > 0) {
            console.log(`Duplicate message detected (mid: ${message.mid}), skipping entire processing`);
            continue;
          }

          // Build content: if no text but attachments exist, create a text representation
          let messageContent = message.text || null;
          const attachmentUrl = message.attachments?.[0]?.payload?.url || null;
          const attachmentType = message.attachments?.[0]?.type || null;
          
          // Detect sticker: Facebook sends likes/stickers as type "image" with sticker_id, or type "sticker"
          const isSticker = attachmentType === 'sticker' || 
            !!message.sticker_id || 
            !!message.attachments?.[0]?.payload?.sticker_id;

          if (!messageContent && message.attachments && message.attachments.length > 0) {
            const att = message.attachments[0];
            const shareUrl = att?.payload?.url || att?.url;
            
            if (isSticker) {
              // Facebook sticker/emoji (like thumbs up) - store as sticker
              messageContent = '[Sticker]';
              console.log("Sticker message detected, sticker_id:", att?.payload?.sticker_id || message.sticker_id);
            } else if (attachmentType === 'fallback' || attachmentType === 'share') {
              // Link share - extract the title/URL
              const title = att?.title || '';
              messageContent = title ? `[Customer shared a link: ${title}]` : '[Customer shared a link]';
            } else if (shareUrl) {
              messageContent = `[Customer sent an attachment: ${shareUrl}]`;
            } else {
              messageContent = `[Customer sent a ${attachmentType || 'media'} attachment]`;
            }
            console.log("Attachment-only message, constructed content:", messageContent);
          }

          // Determine if attachment is a real media file or just a link share
          const isLinkShare = attachmentType === 'fallback' || attachmentType === 'share';
          const actualMediaUrl = (isLinkShare) ? null : attachmentUrl;
          const actualMessageType = isSticker ? "sticker" : (message.attachments && !isLinkShare ? "media" : "text");

          // Store the message
          await supabase.from("messages").insert({
            external_message_id: message.mid,
            conversation_id: conversationId,
            content: messageContent,
            sender_type: "customer",
            message_type: actualMessageType,
            media_url: actualMediaUrl,
            created_at: new Date(timestamp).toISOString(),
          });

          // Update conversation - preserve status if AI processing or if page already replied with a newer message
          const { data: currentConv } = await supabase
            .from("conversations")
            .select("status, last_message_at, updated_at")
            .eq("id", conversationId)
            .single();

          const incomingTimestamp = new Date(timestamp).toISOString();
          const currentLastMessageAt = currentConv?.last_message_at;
          const isOlderMessage = currentLastMessageAt && incomingTimestamp <= currentLastMessageAt;

          let newStatus: string;
          if (currentConv?.status === "ai_processing") {
            // Auto-recover stuck ai_processing: if stuck for more than 3 minutes, reset to unreplied
            const processingAge = Date.now() - new Date(currentConv.updated_at || currentConv.last_message_at).getTime();
            if (processingAge > 3 * 60 * 1000) {
              console.log(`Auto-recovering stuck ai_processing conversation ${conversationId} (stuck for ${Math.round(processingAge/1000)}s)`);
              newStatus = "unreplied";
            } else {
              newStatus = "ai_processing";
            }
          } else if (isOlderMessage && currentConv?.status === "replied") {
            // Don't reset to unreplied if page already replied with a newer message (late webhook)
            newStatus = "replied";
          } else {
            newStatus = "unreplied";
          }

          // Only update last_message_at if this message is actually newer
          const updateData: Record<string, unknown> = {
            status: newStatus,
          };
          if (!isOlderMessage) {
            updateData.last_message_at = incomingTimestamp;
            updateData.last_message_preview = (messageContent || message.text)?.substring(0, 100);
          }
          await supabase.from("conversations").update(updateData).eq("id", conversationId);

          // === Audio/Video CALL detection ===
          // When customer initiates a Messenger audio/video call, reply in a human tone
          // saying we can't take the call right now and ask them to message instead.
          const callAttachmentType = (attachmentType || "").toLowerCase();
          const contentForCallCheck = (messageContent || message.text || "").toLowerCase();
          const isCallEvent =
            callAttachmentType === "audio_call" ||
            callAttachmentType === "video_call" ||
            callAttachmentType === "call" ||
            /\b(started (an? )?(audio|video) call|missed (audio|video )?call|called you|call ended|video chat|audio chat)\b/i.test(contentForCallCheck);

          if (isCallEvent) {
            console.log("Detected audio/video call event from customer, sending human-tone busy reply");
            // Avoid duplicate replies for back-to-back call events
            const { data: lastPageMsgCall } = await supabase
              .from("messages")
              .select("created_at, content")
              .eq("conversation_id", conversationId)
              .eq("sender_type", "page")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const alreadyRepliedRecently =
              lastPageMsgCall?.created_at &&
              new Date(lastPageMsgCall.created_at).getTime() > new Date(timestamp).getTime() - 2 * 60 * 1000 &&
              (lastPageMsgCall.content || "").includes("call receive");

            if (!alreadyRepliedRecently) {
              const callReplyText = "Namaste 🙏 Maaf garnuhos, hami ahile background ma vayera audio/video call receive garna sakdainau. Kripaya tapai ko query message mai pathaidinuhos, hami chittai jawaaf dinechhau.";
              const sent = await sendAutoReply(page.page_access_token, senderId, callReplyText, null);
              if (sent === true) {
                await supabase.from("messages").insert({
                  conversation_id: conversationId,
                  content: callReplyText,
                  sender_type: "page",
                  message_type: "text",
                  created_at: new Date().toISOString(),
                });
                await supabase.from("conversations").update({
                  status: "replied",
                  last_message_preview: callReplyText.substring(0, 100),
                  last_message_at: new Date().toISOString(),
                }).eq("id", conversationId);
              }
            } else {
              console.log("Already replied to a recent call event, skipping duplicate");
              await supabase.from("conversations").update({ status: "replied" }).eq("id", conversationId);
            }
            // Skip template/AI flow for call events
            continue;
          }

          // Phone-based lead detection REMOVED — now handled by AI in lead_action

          // First Message Template: if enabled, send the Nth template for the Nth customer message
          // (1 template → only 1st customer msg, 2 templates → 1st and 2nd customer msgs).
          // From msg N+1 onwards, AI takes over.
          const tmplCfg = (page as any).first_msg_template;
          const tmplList: any[] = Array.isArray(tmplCfg?.messages) ? tmplCfg.messages.filter((m: any) => m && (m.text || m.media || (Array.isArray(m.medias) && m.medias.length > 0))) : [];
          const tmplEnabledForPage = page.ai_enabled && !page.automation_enabled && (page as any).first_msg_template_enabled && tmplList.length > 0;
          if (page.ai_enabled && !page.automation_enabled && (page as any).first_msg_template_enabled && tmplList.length > 0) {
            // Lead detection during template phase: if customer sends a phone number
            // BEFORE AI takes over, still capture it as a lead.
            const incomingText = (messageContent || message.text || "") as string;
            const hasLeadTagAlready = conversationTags.includes("lead-created");
            if (!hasLeadTagAlready) {
              const detectedPhone = extractPhoneNumber(incomingText);
              if (detectedPhone) {
                const digitsOnly = detectedPhone.replace(/\D/g, '');
                if (digitsOnly.length >= 10) {
                  const normalizedPhone = digitsOnly.slice(-10);
                  console.log("Template-phase lead detection, phone:", detectedPhone);
                  const { data: existingLead } = await supabase
                    .from("leads")
                    .select("id")
                    .eq("organization_id", page.organization_id)
                    .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
                    .maybeSingle();

                  if (existingLead) {
                    await supabase.from("leads").update({
                      conversation_id: conversationId,
                      last_message: incomingText.substring(0, 200),
                      updated_at: new Date().toISOString(),
                    }).eq("id", existingLead.id);
                  } else {
                    const { data: conv } = await supabase
                      .from("conversations")
                      .select("participant_name")
                      .eq("id", conversationId)
                      .single();
                    const { error: insertErr } = await supabase.from("leads").insert({
                      phone: detectedPhone,
                      full_name: conv?.participant_name,
                      conversation_id: conversationId,
                      page_id: page.id,
                      source: page.page_name,
                      product: (page as any).product_name || null,
                      last_message: incomingText.substring(0, 200),
                      status: "new",
                      organization_id: page.organization_id,
                      remark: "No Inquiry",
                    });
                    if (insertErr) console.error("Template-phase lead creation error:", insertErr);
                    else console.log("Template-phase lead created:", detectedPhone);
                  }

                  if (!conversationTags.includes("lead-created")) {
                    await supabase.from("conversations").update({
                      tags: [...conversationTags, "lead-created"],
                      ai_followup_step: null,
                      ai_followup_next_at: null,
                    }).eq("id", conversationId);
                    conversationTags = [...conversationTags, "lead-created"];
                  }
                }
              }
            }

            // Template SENDING moved into the debounce+lock block below so that when
            // multiple messages arrive at once we only send ONE template/AI reply for
            // the whole batch (prevents the duplicate-reply race).
          }

          // AI / template reply logic — single entry point per customer message batch
          if (page.ai_enabled && !page.automation_enabled) {
            console.log("AI enabled for page, checking if reply needed");

            // Check if this is a lead conversation with a long gap (15+ days)
            let longGapConfirmation = false;
            if (conversationTags.includes("lead-created") && !isFirstMessage) {
              const { data: lastPageMsg } = await supabase
                .from("messages")
                .select("created_at")
                .eq("conversation_id", conversationId)
                .eq("sender_type", "customer")
                .order("created_at", { ascending: false })
                .limit(2);
              
              if (lastPageMsg && lastPageMsg.length >= 2) {
                const latestTs = new Date(lastPageMsg[0].created_at).getTime();
                const prevTs = new Date(lastPageMsg[1].created_at).getTime();
                const daysDiff = (latestTs - prevTs) / (1000 * 60 * 60 * 24);
                if (daysDiff >= 15) {
                  longGapConfirmation = true;
                  console.log(`Long gap detected: ${daysDiff.toFixed(1)} days between messages. Will ask AI to confirm number.`);
                }
              }
            }
            
            // Customer replied - continue follow-up from current step (don't reset)
            const followupSettings = (page as any).ai_followup_settings;
            if (followupSettings?.enabled && followupSettings.steps?.length > 0) {
              // Fetch current followup step to continue from where we left off
              const { data: convData } = await supabase.from("conversations").select("ai_followup_step, tags").eq("id", conversationId).single();
              const currentStep = convData?.ai_followup_step ?? 0;
              const stepConfig = followupSettings.steps[currentStep];
              if (stepConfig) {
                // Reschedule from NOW + current step's delay (don't reset to step 0)
                const updatedTags = convData?.tags || [];
                if (!updatedTags.includes("FOLLOW-UP")) {
                  updatedTags.push("FOLLOW-UP");
                }
                await supabase.from("conversations").update({
                  ai_followup_next_at: new Date(Date.now() + stepConfig.delay_hours * 60 * 60 * 1000).toISOString(),
                  tags: updatedTags,
                }).eq("id", conversationId);
              }
            }
            
            const isNonsenseOrEmoji = isEmojiOrNonsense(messageContent || "");
            const hasLeadTag = conversationTags.includes("lead-created");
            const hasAnyMedia = !!(message as any).media || !!parseMessageContent(messageContent || "").media;

            // Skip AI ONLY when lead already created AND message is pure emoji/nonsense (saves cost).
            // When no lead yet, ALWAYS route through AI so the customer gets a reply or the
            // conversation lands in ai_failed (never silently marked replied).
            if (isNonsenseOrEmoji && !hasAnyMedia && hasLeadTag) {
              console.log(`Skipping AI reply - emoji/nonsense after lead created`);
              await supabase.from("conversations").update({ status: "replied" }).eq("id", conversationId);
            } else {
              // Skip AI processing if this is NOT the latest message for this sender in this webhook batch
              // This prevents sequential debounce sleeps from causing 504 timeouts
              const latestForThisSender = latestPerSender.get(senderId);
              if (latestForThisSender && latestForThisSender.message?.mid !== message.mid) {
                console.log(`Skipping AI for older batch message (mid: ${message.mid}), latest for sender: ${latestForThisSender.message?.mid}`);
              } else {
              // Configurable debounce: wait for the configured seconds (default 30) to batch messages
              // Add random jitter (0-10s) to prevent thundering herd when many messages arrive simultaneously
              const myMid = message.mid;
              const jitter = Math.floor(Math.random() * 10000); // 0-10 seconds random jitter
              const debounceMs = ((page as any).ai_debounce_seconds || 30) * 1000 + jitter;
              console.log(`Debounce: waiting ${Math.round(debounceMs/1000)}s (${((page as any).ai_debounce_seconds || 30)}s + ${Math.round(jitter/1000)}s jitter) for message batching... (mid: ${myMid})`);
              await new Promise(resolve => setTimeout(resolve, debounceMs));
              
              try {
                // Check if our message is the LATEST customer message in this conversation
                const { data: latestCustomerMsg } = await supabase
                  .from("messages")
                  .select("external_message_id")
                  .eq("conversation_id", conversationId)
                  .eq("sender_type", "customer")
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .single();

                if (latestCustomerMsg?.external_message_id !== myMid) {
                  console.log(`Not the latest message (latest: ${latestCustomerMsg?.external_message_id}, mine: ${myMid}), skipping AI for this worker`);
                  continue; // continue the messaging loop, don't exit the handler — must return 200 to Facebook
                }

                console.log("This is the latest customer message, proceeding with AI reply");

                // If any page reply/template was already sent after this latest customer
                // message, this whole burst is already handled. This prevents older
                // webhook workers (still waking from debounce) from sending template #2
                // or an AI reply for the same fast multi-message batch.
                const { data: latestPageMsgBeforeLock } = await supabase
                  .from("messages")
                  .select("created_at")
                  .eq("conversation_id", conversationId)
                  .eq("sender_type", "page")
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                const { data: latestCustomerMsgWithTimeBeforeLock } = await supabase
                  .from("messages")
                  .select("created_at")
                  .eq("conversation_id", conversationId)
                  .eq("sender_type", "customer")
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (
                  latestPageMsgBeforeLock?.created_at &&
                  latestCustomerMsgWithTimeBeforeLock?.created_at &&
                  new Date(latestPageMsgBeforeLock.created_at).getTime() > new Date(latestCustomerMsgWithTimeBeforeLock.created_at).getTime()
                ) {
                  console.log("Batch already handled by a page reply after latest customer message, skipping");
                  await supabase.from("conversations").update({ status: "replied" }).eq("id", conversationId);
                  continue;
                }

                // No newer messages - we are the last worker. Try atomic lock.
                // Accept "unreplied" OR "replied" (follow-up may have set it to "replied" during debounce)
                // Also recover stuck "ai_processing" conversations older than 3 minutes
                const { data: stuckCheck } = await supabase
                  .from("conversations")
                  .select("status, updated_at")
                  .eq("id", conversationId)
                  .single();
                
                let canLock = stuckCheck?.status === "unreplied" || stuckCheck?.status === "replied";
                if (stuckCheck?.status === "ai_processing") {
                  const stuckAge = Date.now() - new Date(stuckCheck.updated_at).getTime();
                  if (stuckAge > 3 * 60 * 1000) {
                    console.log(`Recovering stuck ai_processing lock (${Math.round(stuckAge/1000)}s old)`);
                    canLock = true;
                  }
                }
                
                let lockResult: any[] | null = null;
                if (canLock) {
                  const { data } = await supabase
                    .from("conversations")
                    .update({ status: "ai_processing", updated_at: new Date().toISOString() })
                    .eq("id", conversationId)
                    .in("status", ["unreplied", "replied", ...(stuckCheck?.status === "ai_processing" ? ["ai_processing"] : [])])
                    .select("id");
                  lockResult = data;
                }

                if (!lockResult || lockResult.length === 0) {
                  console.log("Another worker already processing or replied, skipping AI reply");
                } else {
                  const { data: latestPageMsgAfterLock } = await supabase
                    .from("messages")
                    .select("created_at")
                    .eq("conversation_id", conversationId)
                    .eq("sender_type", "page")
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                  const { data: latestCustomerMsgAfterLock } = await supabase
                    .from("messages")
                    .select("created_at")
                    .eq("conversation_id", conversationId)
                    .eq("sender_type", "customer")
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                  if (
                    latestPageMsgAfterLock?.created_at &&
                    latestCustomerMsgAfterLock?.created_at &&
                    new Date(latestPageMsgAfterLock.created_at).getTime() > new Date(latestCustomerMsgAfterLock.created_at).getTime()
                  ) {
                    console.log("Batch already handled after lock, releasing without another reply");
                    await supabase.from("conversations").update({ status: "replied" }).eq("id", conversationId);
                    continue;
                  }

                  // FIRST: if we're still in the first-message template phase, send next template
                  //        instead of calling AI. This runs inside the lock so only ONE worker
                  //        handles the whole batch of incoming customer messages.
                  let handledByTemplate = false;
                  if (tmplEnabledForPage && !conversationTags.includes("lead-created")) {
                    const { count: pageMsgCount } = await supabase
                      .from("messages")
                      .select("id", { count: "exact", head: true })
                      .eq("conversation_id", conversationId)
                      .eq("sender_type", "page");
                    const sentSoFar = pageMsgCount || 0;
                    if (sentSoFar < tmplList.length) {
                      const tmplMsg = tmplList[sentSoFar];
                      const tmplMedias = resolveTemplateMedias(tmplMsg);
                      console.log(`Sending template #${sentSoFar + 1} of ${tmplList.length} (locked), medias=${tmplMedias.length}`);
                      const sent = await sendTemplateMessage(page.page_access_token, senderId, tmplMsg.text || "", tmplMedias);
                      if (sent === true) {
                        if (tmplMsg.text || tmplMedias.length > 0) {
                          await supabase.from("messages").insert({
                            conversation_id: conversationId,
                            content: tmplMsg.text || null,
                            sender_type: "page",
                            message_type: tmplMedias.length > 0 ? "media" : "text",
                            media_url: tmplMedias[0]?.url || null,
                            created_at: new Date().toISOString(),
                          });
                        }
                        await supabase.from("conversations").update({
                          status: "replied",
                          last_message_preview: (tmplMsg.text || "[Template sent]").substring(0, 100),
                          last_message_at: new Date().toISOString(),
                        }).eq("id", conversationId);

                        // After LAST template, start follow-up tracking
                        if (sentSoFar + 1 >= tmplList.length) {
                          const followupSettings = (page as any).ai_followup_settings;
                          if (followupSettings?.enabled && followupSettings.steps?.length > 0) {
                            const firstStep = followupSettings.steps[0];
                            const tags = conversationTags.includes("FOLLOW-UP") ? conversationTags : [...conversationTags, "FOLLOW-UP"];
                            await supabase.from("conversations").update({
                              ai_followup_step: 0,
                              ai_followup_next_at: new Date(Date.now() + firstStep.delay_hours * 60 * 60 * 1000).toISOString(),
                              tags,
                            }).eq("id", conversationId);
                          }
                        }
                      } else if (sent === "permanent_fail") {
                        await supabase.from("conversations").update({ status: "replied", last_message_preview: "⚠️ User unavailable on Facebook" }).eq("id", conversationId);
                      } else {
                        // Release lock so a retry job can pick it up
                        await supabase.from("conversations").update({ status: "unreplied" }).eq("id", conversationId);
                      }
                      handledByTemplate = true;
                    }
                  }

                  if (!handledByTemplate) {
                  const { data: recentMessages } = await supabase
                    .from("messages")
                    .select("content, sender_type, created_at, media_url, message_type")
                    .eq("conversation_id", conversationId)
                    .order("created_at", { ascending: false })
                    .limit(15);

                  const latestMessages = (recentMessages || []).reverse();

                  const unrepliedCustomerMessages: string[] = [];
                  const unrepliedImageUrls: string[] = [];
                  for (let i = latestMessages.length - 1; i >= 0; i--) {
                    if (latestMessages[i].sender_type === 'customer') {
                      if (latestMessages[i].content) unrepliedCustomerMessages.unshift(latestMessages[i].content!);
                      // Only include actual image URLs (not audio/video/links) to avoid AI "unsupported format" errors
                      if (latestMessages[i].media_url) {
                        const mediaUrl = latestMessages[i].media_url!.toLowerCase();
                        // Exclude link shares and reels - they are NOT images and crash AI models
                        const isLinkUrl = mediaUrl.includes('l.facebook.com/l.php') || mediaUrl.includes('facebook.com/reel') || mediaUrl.includes('fb.watch') || mediaUrl.includes('youtu.be') || mediaUrl.includes('youtube.com') || mediaUrl.includes('fb.me');
                        const isImage = !isLinkUrl && (
                          /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(mediaUrl) || 
                          latestMessages[i].message_type === 'image' ||
                          (!mediaUrl.includes('.mp4') && !mediaUrl.includes('.mp3') && !mediaUrl.includes('.wav') && !mediaUrl.includes('.ogg') && !mediaUrl.includes('.m4a') && !mediaUrl.includes('audioclip') && !mediaUrl.includes('videoclip'))
                        );
                        if (isImage) {
                          unrepliedImageUrls.push(latestMessages[i].media_url!);
                        } else {
                          // For audio/video, add a text note instead so AI knows about it
                          unrepliedCustomerMessages.push('[Customer sent an audio/video message]');
                          console.log("Skipping non-image media from AI imageUrls:", latestMessages[i].media_url?.substring(0, 80));
                        }
                      }
                    } else break;
                  }

                  const combinedCustomerMessage = unrepliedCustomerMessages.join('\n');
                  const allNonsense = hasLeadTag && unrepliedCustomerMessages.every(m => isEmojiOrNonsense(m));
                  
                  if (allNonsense && unrepliedImageUrls.length === 0) {
                    console.log("All unreplied messages are emoji/nonsense after lead created, skipping");
                    // Release lock back to unreplied
                    await supabase.from("conversations").update({ status: "unreplied" }).eq("id", conversationId);
                  } else {
                    const conversationHistory = latestMessages
                      .map(m => `${m.sender_type === 'customer' ? 'Customer' : 'Business'}: ${m.content || (m.media_url ? '[sent an image]' : '')}`)
                      .join('\n');

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
                          aiInstructions: (page as any).ai_instructions || "",
                          imageUrls: unrepliedImageUrls.length > 0 ? unrepliedImageUrls : undefined,
                          longGapConfirmation,
                          hasExistingLead: hasLeadTag,
                          mediaAssets: (page as any).ai_media_assets || [],
                          pageId: page.id,
                        }),
                      }
                    );

                    if (aiResponse.ok) {
                      const aiData = await aiResponse.json();
                      const suggestedReply = aiData.suggestedReply;
                      const leadAction = aiData.leadAction;
                      const isComplaint = aiData.isComplaint === true;
                      
                      console.log("AI response - leadAction:", JSON.stringify(leadAction), "isComplaint:", isComplaint, "hasReply:", !!suggestedReply);

                      if (suggestedReply) {
                        // REPLY DEDUP: Check if we already sent a very similar reply in the last 5 minutes
                        const { data: recentReplies } = await supabase
                          .from("messages")
                          .select("content, created_at")
                          .eq("conversation_id", conversationId)
                          .eq("sender_type", "page")
                          .order("created_at", { ascending: false })
                          .limit(3);
                        
                        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
                        const isDuplicateReply = recentReplies?.some(r => 
                          r.created_at > fiveMinAgo && 
                          r.content && suggestedReply &&
                          (r.content === suggestedReply || 
                           r.content.substring(0, 80) === suggestedReply.substring(0, 80))
                        );
                        
                        if (isDuplicateReply) {
                          console.log("DUPLICATE REPLY PREVENTED - same reply already sent in last 5 minutes");
                          await supabase.from("conversations").update({ 
                            status: "replied",
                            ai_fail_reason: null,
                          }).eq("id", conversationId);
                        } else {
                        // Check if AI wants to send media
                        const mediaToSend = aiData.mediaToSend || null;
                        const sent = await sendAutoReply(page.page_access_token, senderId, suggestedReply, mediaToSend);
                        
                        // Send additional media if present
                        if (mediaToSend?.additional && Array.isArray(mediaToSend.additional)) {
                          for (const extra of mediaToSend.additional) {
                            await sendAutoReply(page.page_access_token, senderId, "", extra);
                          }
                        }
                        
                        if (sent === true) {
                          await supabase.from("messages").insert({
                            conversation_id: conversationId,
                            content: suggestedReply,
                            sender_type: "page",
                            message_type: "text",
                            created_at: new Date().toISOString(),
                          });

                          await supabase.from("conversations").update({
                            status: "replied",
                            last_message_preview: suggestedReply.substring(0, 100),
                            last_message_at: new Date().toISOString(),
                            ai_fail_reason: null,
                          }).eq("id", conversationId);

                          // Tag as COMPLAIN if AI detected complaint
                          if (isComplaint && !conversationTags.includes("COMPLAIN")) {
                            conversationTags = [...conversationTags, "COMPLAIN"];
                            await supabase.from("conversations").update({
                              tags: conversationTags,
                            }).eq("id", conversationId);
                          }

                          // AI-based lead creation / update
                          // FALLBACK: If AI didn't detect lead, scan unreplied customer messages for phone numbers directly
                          let finalLeadAction = leadAction;
                          if ((!finalLeadAction?.should_create || !finalLeadAction?.phone) && !hasLeadTag) {
                            // Scan all unreplied customer messages for phone numbers
                            for (const custMsg of unrepliedCustomerMessages) {
                              const detectedPhone = extractPhoneNumber(custMsg);
                              if (detectedPhone) {
                                const digits = detectedPhone.replace(/\D/g, '');
                                if (digits.length >= 10 && digits.startsWith('9')) {
                                  console.log("FALLBACK phone detection found:", detectedPhone, "in message:", custMsg.substring(0, 50));
                                  finalLeadAction = { should_create: true, phone: detectedPhone, invalid_number: false, reason: "fallback-phone-detection" };
                                  break;
                                }
                              }
                            }
                          }

                          if (finalLeadAction?.should_create && finalLeadAction.phone && !finalLeadAction.invalid_number) {
                            const rawPhone = finalLeadAction.phone;
                            const digitsOnly = rawPhone.replace(/\D/g, '');
                            const normalizedPhone = digitsOnly.slice(-10);

                            // Validate: must be at least 10 digits
                            if (digitsOnly.length < 10) {
                              console.log(`Invalid phone: ${rawPhone} has only ${digitsOnly.length} digits, skipping lead creation`);
                            } else {

                            if (hasLeadTag) {
                              // Lead tag already set — dedup before inserting (prevent same phone duplicates across messages)
                              const { data: dupLead } = await supabase
                                .from("leads")
                                .select("id")
                                .eq("organization_id", page.organization_id)
                                .or(`phone.eq.${rawPhone},phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
                                .limit(1)
                                .maybeSingle();

                              if (dupLead) {
                                console.log("Skip duplicate lead (hasLeadTag), phone:", rawPhone);
                                await supabase.from("leads").update({
                                  conversation_id: conversationId,
                                  last_message: combinedCustomerMessage?.substring(0, 200),
                                  updated_at: new Date().toISOString(),
                                }).eq("id", dupLead.id);
                              } else {
                                console.log("New phone on tagged convo — creating lead:", rawPhone);
                                const { data: conv } = await supabase
                                  .from("conversations")
                                  .select("participant_name")
                                  .eq("id", conversationId)
                                  .single();

                                const { error: insertErr } = await supabase.from("leads").insert({
                                  phone: rawPhone,
                                  full_name: conv?.participant_name,
                                  conversation_id: conversationId,
                                  page_id: page.id,
                                  source: page.page_name,
                                  product: (page as any).product_name || null,
                                  last_message: combinedCustomerMessage?.substring(0, 200),
                                  status: "new",
                                  organization_id: page.organization_id,
                                  remark: finalLeadAction.reason || "No Inquiry",
                                });
                                if (insertErr) console.error("New lead creation error:", insertErr);
                              }
                            } else {
                              // New lead — dedup check then create
                              console.log("Lead detected with phone:", rawPhone);

                              // Dedup check by phone
                              const { data: existingLead } = await supabase
                                .from("leads")
                                .select("id")
                                .eq("organization_id", page.organization_id)
                                .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
                                .maybeSingle();

                              if (existingLead) {
                                await supabase.from("leads").update({
                                  conversation_id: conversationId,
                                  last_message: combinedCustomerMessage?.substring(0, 200),
                                  updated_at: new Date().toISOString(),
                                }).eq("id", existingLead.id);
                              } else {
                                const { data: conv } = await supabase
                                  .from("conversations")
                                  .select("participant_name")
                                  .eq("id", conversationId)
                                  .single();

                                // AI-powered remark generation
                                let remark = "No Inquiry";
                                const { data: recentCustMsgs } = await supabase
                                  .from("messages")
                                  .select("content, sender_type")
                                  .eq("conversation_id", conversationId)
                                  .eq("sender_type", "customer")
                                  .order("created_at", { ascending: false })
                                  .limit(10);

                                if (recentCustMsgs && recentCustMsgs.length > 0) {
                                  const inquiryTexts = recentCustMsgs
                                    .map((m: any) => m.content || "")
                                    .filter((t: string) => {
                                      const stripped = t.replace(/[\s\-\(\)\.\+]/g, '');
                                      return t.trim().length > 0 && !/^\d{9,}$/.test(stripped);
                                    })
                                    .reverse();

                                  if (inquiryTexts.length > 0) {
                                    try {
                                      const aiSummaryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                                        method: "POST",
                                        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          model: "google/gemini-2.5-flash-lite",
                                          messages: [
                                            { role: "system", content: "You are an inquiry summarizer. Given customer chat messages, extract what the customer is inquiring about and write a very short summary (max 10 words) in English starting with 'Inquiry for...'. If no clear inquiry, respond with 'No Inquiry'. Only output the summary." },
                                            { role: "user", content: `Customer messages:\n${inquiryTexts.join('\n')}` }
                                          ],
                                        }),
                                      });
                                      if (aiSummaryResponse.ok) {
                                        const summaryData = await aiSummaryResponse.json();
                                        const summary = summaryData.choices?.[0]?.message?.content?.trim();
                                        remark = summary && summary.length > 0 ? summary.substring(0, 200) : inquiryTexts.join(' | ').substring(0, 500);
                                      } else {
                                        remark = inquiryTexts.join(' | ').substring(0, 500);
                                      }
                                    } catch {
                                      remark = inquiryTexts.join(' | ').substring(0, 500);
                                    }
                                  }
                                }

                                const { error: insertErr } = await supabase.from("leads").insert({
                                  phone: rawPhone,
                                  full_name: conv?.participant_name,
                                  conversation_id: conversationId,
                                  page_id: page.id,
                                  source: page.page_name,
                                  product: (page as any).product_name || null,
                                  last_message: combinedCustomerMessage?.substring(0, 200),
                                  status: "new",
                                  organization_id: page.organization_id,
                                  remark,
                                });
                                if (insertErr) {
                                  console.error("Lead creation error:", insertErr);
                                }
                              }

                              // Tag conversation as lead-created
                              if (!conversationTags.includes("lead-created")) {
                                await supabase.from("conversations").update({
                                  tags: [...conversationTags, "lead-created"],
                                }).eq("id", conversationId);
                                conversationTags = [...conversationTags, "lead-created"];
                              }

                              // Stop follow-up after lead created
                              await supabase.from("conversations").update({
                                ai_followup_step: null,
                                ai_followup_next_at: null,
                              }).eq("id", conversationId);
                            }
                            } // end digit validation else
                          }
                            
                          // Start AI follow-up tracking if no lead yet
                          if (!conversationTags.includes("lead-created")) {
                            const followupSettings = (page as any).ai_followup_settings;
                            if (followupSettings?.enabled && followupSettings.steps?.length > 0) {
                              const firstStep = followupSettings.steps[0];
                              // Add FOLLOW-UP tag
                              if (!conversationTags.includes("FOLLOW-UP")) {
                                conversationTags = [...conversationTags, "FOLLOW-UP"];
                              }
                              await supabase.from("conversations").update({
                                ai_followup_step: 0,
                                ai_followup_next_at: new Date(Date.now() + firstStep.delay_hours * 60 * 60 * 1000).toISOString(),
                                tags: conversationTags,
                              }).eq("id", conversationId);
                            }
                          }
                    } else if (sent === "permanent_fail") {
                          // User blocked/deactivated - mark as replied so it doesn't keep retrying
                          console.log("Facebook user unavailable (permanent), marking as replied");
                          await supabase.from("conversations").update({ status: "replied", last_message_preview: "⚠️ User unavailable on Facebook" }).eq("id", conversationId);
                        } else {
                          // sendAutoReply FAILED — mark as ai_failed
                          console.error("sendAutoReply failed, marking as ai_failed");
                          await supabase.from("conversations").update({ status: "ai_failed", ai_fail_reason: "Facebook send failed" }).eq("id", conversationId);
                        }
                        } // end duplicate reply else
                      } else {
                        // No reply generated, release lock
                        await supabase.from("conversations").update({ status: "ai_failed", ai_fail_reason: "No AI reply generated" }).eq("id", conversationId);
                      }
                    } else {
                      console.error("AI reply function error:", aiResponse.status);
                      // Parse error reason from response
                      let failReason = "AI service error";
                      try {
                        const errBody = await aiResponse.json();
                        if (aiResponse.status === 402) failReason = "Credits depleted";
                        else if (aiResponse.status === 429) failReason = "Rate limit exceeded";
                        else if (errBody?.error) failReason = errBody.error.substring(0, 100);
                      } catch {}
                      await supabase.from("conversations").update({ status: "ai_failed", ai_fail_reason: failReason }).eq("id", conversationId);
                    }
                  }
                  } // end: if (!handledByTemplate)
                }
              } catch (aiError) {
                console.error("AI reply error:", aiError);
                const reason = aiError instanceof Error ? aiError.message.substring(0, 100) : "Unknown error";
                await supabase.from("conversations").update({ status: "ai_failed", ai_fail_reason: reason }).eq("id", conversationId).then(() => {});
              }
            } // end: skip older batch messages
            }
          }
          
          // Automation auto-reply logic
          else if (page.automation_enabled) {
            console.log("Automation enabled, checking auto-reply rules");
            
            let autoReplyMessage: string | null = null;
            let autoReplyMedia: MediaAttachment | undefined = undefined;
            let autoReplyType: string | null = null;

            const keywordMatch = checkKeywordMatch(
              message.text || "",
              (page.auto_reply_keywords as KeywordRule[]) || []
            );
            
            if (keywordMatch) {
              autoReplyMessage = keywordMatch.reply;
              autoReplyMedia = keywordMatch.media;
              autoReplyType = "keyword";
            } else if (isFirstMessage && page.auto_reply_first_message) {
              autoReplyMessage = page.auto_reply_first_message;
              autoReplyType = "first_message";
            } else if (!isFirstMessage && page.auto_reply_followup) {
              autoReplyMessage = page.auto_reply_followup;
              autoReplyType = "followup";
            }

            if (autoReplyMessage) {
              const parsed = parseMessageContent(autoReplyMessage);
              const logText = parsed.text || autoReplyMessage;
              
              const sent = await sendAutoReply(page.page_access_token, senderId, autoReplyMessage, autoReplyMedia);
              
              if (sent) {
                await supabase.from("messages").insert({
                  conversation_id: conversationId,
                  content: parsed.text || autoReplyMessage,
                  sender_type: "page",
                  message_type: autoReplyMedia ? "media" : "text",
                  media_url: autoReplyMedia?.url || parsed.media?.url,
                  created_at: new Date().toISOString(),
                });

                await supabase.from("conversations").update({
                  status: "replied",
                  last_message_preview: (parsed.text || autoReplyMessage).substring(0, 100),
                  last_message_at: new Date().toISOString(),
                }).eq("id", conversationId);
              }
            }

            // Start automation follow-up tracking if no lead yet and follow-up messages configured
            if (!conversationTags.includes("lead-created")) {
              const followupMsgs = Array.isArray(page.auto_followup_messages) ? page.auto_followup_messages : [];
              if (followupMsgs.length > 0) {
                // Only start if not already tracking
                const { data: convCheck } = await supabase
                  .from("conversations")
                  .select("auto_followup_step")
                  .eq("id", conversationId)
                  .single();
                
                if (convCheck && convCheck.auto_followup_step === null) {
                  await supabase.from("conversations").update({
                    auto_followup_step: 0,
                    auto_followup_next_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // first follow-up after 24h
                  }).eq("id", conversationId);
                  console.log("Automation follow-up tracking started for conv:", conversationId);
                }
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
