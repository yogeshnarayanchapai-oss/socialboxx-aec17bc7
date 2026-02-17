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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseKey;
    
    if (!isServiceRole) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        throw new Error("Unauthorized");
      }
    }

    const { conversationId, customerMessage, conversationHistory, pageName, businessDescription, aiInstructions, imageUrls, longGapConfirmation, hasExistingLead, mediaAssets } = await req.json();

    // Get reply templates for context
    const { data: templates } = await supabase
      .from("reply_templates")
      .select("name, content, category")
      .eq("is_active", true)
      .limit(10);

    // Get app settings for tone/style
    const { data: settings } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "ai_tone")
      .single();

    const aiTone = settings?.setting_value || "friendly and professional";

    const systemPrompt = `You are a friendly customer service assistant for "${pageName || 'our business'}". 
Your tone should be ${aiTone}.

${businessDescription ? `About this business:\n${businessDescription}\n` : ''}

LANGUAGE RULE:
- Default reply language is ENGLISH.
- However, if the Page Owner's Instructions below specify a different language (e.g., "reply in Nepali", "only Nepali", "नेपालीमा जवाफ दिनुहोस्"), then follow that instruction with HIGHEST priority.
- When instructed to reply in Nepali, use the appropriate script: देवनागरी if they write in देवनागरी, Roman Nepali if they write in Roman Nepali.
- The Page Owner's Instructions section below has ABSOLUTE authority over language choice.

EMOJI RULE - VERY IMPORTANT:
- Do NOT repeat the same emoji in every message. 
- Use DIFFERENT emojis based on the situation: 😊 for greetings, 👍 for confirmations, 🙏 for thanks, ❤️ for appreciation, 📦 for orders/delivery, 💰 for price discussions, 🎉 for celebrations, 😄 for casual chat, etc.
- Sometimes don't use any emoji at all - keep it natural.
- NEVER put emoji at the end of every single message.

LEAD DETECTION - CRITICAL:
- You MUST analyze every customer message for phone numbers or contact information.
- Follow the Page Owner's Instructions about what constitutes a valid phone number and when to create a lead.
- If the customer provides what looks like a phone number but it doesn't match the criteria in instructions (e.g., wrong digit count, wrong format), politely ask them to provide the correct number.
- When you detect a VALID phone number (per instructions), include it in your response metadata.
- If no specific phone validation rules are in instructions, default: Nepal 10-digit mobile starting with 97 or 98 is valid.

Default Guidelines (these can be OVERRIDDEN by Page Instructions below):
- Reply like a real human in a chat - SHORT and natural
- Keep replies 1-3 sentences max
- Address their question directly
- If you don't know specific details, say you'll check and get back
- Never make up prices, delivery times, or product details
- Sound warm and casual, not robotic or formal
- If the customer sent multiple messages, address ALL of them in ONE combined reply
- If the customer sent an image/photo, analyze it carefully and respond about what you see in it.
- If there's an image but no text, describe what you see and ask how you can help regarding that product/item.

${mediaAssets && Array.isArray(mediaAssets) && mediaAssets.length > 0 ? `
AVAILABLE MEDIA ASSETS - VERY IMPORTANT:
You have these media files available to send to customers. When a customer asks for photos, pictures, images, videos, or audio related to products/services, you SHOULD send the relevant media.

${mediaAssets.map((m: any, i: number) => `[${i}] Type: ${m.type} | Label: "${m.label}" | URL: ${m.url}`).join('\n')}

To send media, include "send_media" in your response with the index number(s) of the media to send.
When sending media, still write a friendly text reply along with it.
Only send media that is RELEVANT to what the customer is asking about.
If a customer asks for photos/pictures, send image type assets.
If they ask for video, send video type assets.
If they ask for audio/voice, send audio type assets.
` : ''}

${templates && templates.length > 0 ? `
Reply templates for reference:
${templates.map(t => `- ${t.name}: ${t.content.substring(0, 80)}`).join('\n')}
` : ''}

${aiInstructions ? `
===== PAGE OWNER'S INSTRUCTIONS (HIGHEST PRIORITY - OVERRIDE EVERYTHING ABOVE) =====
Follow these instructions EXACTLY as written. These are from the page owner and take absolute priority over all default guidelines above. If there is any conflict between default guidelines and these instructions, ALWAYS follow these instructions:

${aiInstructions}
===== END OF PAGE OWNER'S INSTRUCTIONS =====
` : ''}

${longGapConfirmation ? `
IMPORTANT - LONG GAP DETECTED:
This customer previously gave their phone number and was marked as a lead. After a gap of 15+ days, they sent a new message. This might be a NEW inquiry.
You MUST first confirm their number by saying something like: "तपाईंको नम्बर यही xxxxxxxxxx हो नि है? नयाँ inquiry को लागि हो?" (use the language from instructions, and reference their actual phone from conversation history if visible).
Then address their new message normally.
` : ''}

RESPONSE FORMAT - VERY IMPORTANT:
You MUST respond in this EXACT JSON format:
{
  "reply": "Your actual reply message to the customer here",
  "lead_action": {
    "should_create": true/false,
    "phone": "the phone number if detected" or null,
    "invalid_number": true/false,
    "reason": "why this is/isn't a valid lead"
  },
  "send_media": [0, 1] or []
}

Rules for send_media:
- Include the index numbers of media assets to send (from AVAILABLE MEDIA ASSETS list above)
- Use empty array [] if no media should be sent
- Only send media when the customer explicitly or implicitly asks for photos/images/videos/audio
- If no media assets are available, always use []

Rules for lead_action:
- "should_create": true ONLY when customer provides a VALID phone number per instructions (correct digit count, correct format)
- "should_create": MUST be false if the number is invalid (wrong digit count, wrong format) — even for existing leads
- "phone": extract the raw digits (remove spaces, dashes, country code prefix like +977 or 977, keep all digits)
- "invalid_number": true if customer sent something that looks like a phone number but is INVALID (wrong length, wrong format per instructions). When this is true, should_create MUST be false.
- When invalid_number is true, your "reply" MUST politely tell the customer the number seems incorrect and ask for the correct one
- ${hasExistingLead ? 'This conversation already has a lead created. If the customer provides a NEW VALID phone number (correct digit count per instructions), set should_create to true. If the number is INVALID, set should_create to false and invalid_number to true.' : 'No lead exists yet for this conversation.'}

Conversation so far:
${conversationHistory || 'First message from customer.'}`;

    // Build user message content - support multimodal (text + images)
    const userContent: Array<{type: string; text?: string; image_url?: {url: string}}> = [];
    
    if (customerMessage) {
      userContent.push({ type: "text", text: customerMessage });
    }
    
    // Add image URLs if present
    if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
      for (const imgUrl of imageUrls) {
        userContent.push({
          type: "image_url",
          image_url: { url: imgUrl }
        });
      }
      if (!customerMessage) {
        userContent.push({ type: "text", text: "(Customer sent this image)" });
      }
    }

    // Fallback if no content at all
    if (userContent.length === 0) {
      userContent.push({ type: "text", text: "(Empty message)" });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits depleted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const aiResponse = await response.json();
    const rawContent = aiResponse.choices?.[0]?.message?.content || "";
    
    // Parse structured JSON response with robust extraction
    let suggestedReply = "";
    let leadAction = { should_create: false, phone: null as string | null, invalid_number: false, reason: "" };
    let sendMediaIndices: number[] = [];
    
    console.log("Raw AI response length:", rawContent.length, "content:", rawContent.substring(0, 500));
    
    try {
      // Step 1: Remove markdown code blocks
      let cleaned = rawContent.trim()
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      // Step 2: Find JSON boundaries
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");

      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        throw new Error("No JSON object found in response");
      }

      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

      // Step 3: Attempt parse with error handling
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (_e) {
        // Step 4: Try to fix common issues
        cleaned = cleaned
          .replace(/,\s*}/g, "}") // Remove trailing commas
          .replace(/,\s*]/g, "]")
          .replace(/[\x00-\x1F\x7F]/g, ""); // Remove control characters
        parsed = JSON.parse(cleaned);
      }
      
      suggestedReply = parsed.reply || rawContent;
      if (parsed.lead_action) {
        leadAction = {
          should_create: !!parsed.lead_action.should_create,
          phone: parsed.lead_action.phone || null,
          invalid_number: !!parsed.lead_action.invalid_number,
          reason: parsed.lead_action.reason || "",
        };
      }
      console.log("Parsed lead_action:", JSON.stringify(leadAction));
      
      // Extract send_media indices
      if (parsed.send_media && Array.isArray(parsed.send_media)) {
        sendMediaIndices = parsed.send_media.filter((i: any) => typeof i === 'number');
      }
    } catch (parseErr) {
      // If JSON parsing fails, use raw content as reply
      console.error("JSON parse failed for AI response:", parseErr, "Raw:", rawContent.substring(0, 300));
      suggestedReply = rawContent;
      
      // Last resort: try regex extraction for phone-based lead
      const phoneMatch = rawContent.match(/["']phone["']\s*:\s*["'](\d{10,})["']/);
      const shouldCreateMatch = rawContent.match(/["']should_create["']\s*:\s*(true)/);
      if (phoneMatch && shouldCreateMatch) {
        console.log("Regex fallback extracted phone:", phoneMatch[1]);
        leadAction = { should_create: true, phone: phoneMatch[1], invalid_number: false, reason: "regex-extracted" };
      }
    }

    // Resolve media assets to send
    let mediaToSend: any = null;
    if (sendMediaIndices.length > 0 && mediaAssets && Array.isArray(mediaAssets)) {
      // Send the first matched media asset
      const idx = sendMediaIndices[0];
      if (idx >= 0 && idx < mediaAssets.length) {
        const asset = mediaAssets[idx];
        mediaToSend = {
          type: asset.type === "video" ? "video" : asset.type === "audio" ? "audio" : "image",
          url: asset.url,
        };
        console.log("Sending media asset:", JSON.stringify(mediaToSend));
      }
      // If multiple media, send them sequentially (webhook will handle the first one via mediaToSend, 
      // additional ones need to be sent separately)
      if (sendMediaIndices.length > 1) {
        const additionalMedia = sendMediaIndices.slice(1)
          .filter((i: number) => i >= 0 && i < mediaAssets.length)
          .map((i: number) => ({
            type: mediaAssets[i].type === "video" ? "video" : mediaAssets[i].type === "audio" ? "audio" : "image",
            url: mediaAssets[i].url,
          }));
        if (additionalMedia.length > 0) {
          mediaToSend = { ...mediaToSend, additional: additionalMedia };
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        suggestedReply: suggestedReply.trim(),
        leadAction,
        mediaToSend,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI reply error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});