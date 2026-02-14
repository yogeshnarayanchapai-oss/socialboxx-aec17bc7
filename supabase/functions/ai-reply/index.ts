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
    
    // Allow service role key (for internal calls from webhook)
    const isServiceRole = token === supabaseKey;
    
    if (!isServiceRole) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        throw new Error("Unauthorized");
      }
    }

    const { conversationId, customerMessage, conversationHistory, pageName, businessDescription, aiInstructions, imageUrls } = await req.json();

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
${aiInstructions ? `\nSPECIAL INSTRUCTIONS (follow these strictly):\n${aiInstructions}\n` : ''}

CRITICAL LANGUAGE RULE - You MUST follow this:
- If the customer writes in Nepali (देवनागरी script like "नमस्ते", "कति हो"), reply in Nepali देवनागरी script.
- If the customer writes in Roman Nepali (like "namaste", "kati ho", "mero lagi ke chha"), reply in Roman Nepali.
- If the customer writes in English, reply in English.
- Always match the EXACT language and script the customer used.

EMOJI RULE - VERY IMPORTANT:
- Do NOT repeat the same emoji in every message. 
- Use DIFFERENT emojis based on the situation: 😊 for greetings, 👍 for confirmations, 🙏 for thanks, ❤️ for appreciation, 📦 for orders/delivery, 💰 for price discussions, 🎉 for celebrations, 😄 for casual chat, etc.
- Sometimes don't use any emoji at all - keep it natural.
- NEVER put emoji at the end of every single message.

Guidelines:
- Reply like a real human in a chat - SHORT and natural
- Keep replies 1-3 sentences max
- Address their question directly
- If you don't know specific details, say you'll check and get back
- Never make up prices, delivery times, or product details
- Sound warm and casual, not robotic or formal
- If the customer sent multiple messages, address ALL of them in ONE combined reply
- If the customer sent an image/photo, analyze it carefully and respond about what you see in it. Describe the product or content shown.
- If there's an image but no text, describe what you see and ask how you can help regarding that product/item.

${templates && templates.length > 0 ? `
Reply templates for reference:
${templates.map(t => `- ${t.name}: ${t.content.substring(0, 80)}`).join('\n')}
` : ''}

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
        max_tokens: 500,
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
    const suggestedReply = aiResponse.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ 
        success: true, 
        suggestedReply: suggestedReply.trim(),
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
