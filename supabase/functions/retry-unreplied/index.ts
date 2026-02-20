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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { pageId } = await req.json();
    if (!pageId) throw new Error("pageId is required");

    // Get page config
    const { data: page, error: pageError } = await supabase
      .from("connected_pages")
      .select("id, page_id, page_name, page_access_token, ai_enabled, ai_description, ai_instructions, ai_debounce_seconds, ai_media_assets, product_name, organization_id, ai_followup_settings")
      .eq("id", pageId)
      .single();

    if (pageError || !page) throw new Error("Page not found");
    if (!page.ai_enabled) throw new Error("AI is not enabled for this page");

    const holdTimeSeconds = page.ai_debounce_seconds || 30;
    const functionStartTime = Date.now();
    const MAX_FUNCTION_TIME_MS = 120000; // 120s safety limit (edge fn has 150s)

    // Get all ai_failed and stuck ai_processing conversations for this page
    const { data: unrepliedConvs, error: convError } = await supabase
      .from("conversations")
      .select("id, participant_id, participant_name, tags, status, last_message_at")
      .eq("page_id", pageId)
      .is("deleted_at", null)
      .in("status", ["ai_failed", "ai_processing"])
      .order("last_message_at", { ascending: true });

    if (convError) throw convError;
    if (!unrepliedConvs || unrepliedConvs.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No AI failed conversations found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const conv of unrepliedConvs) {
      // Safety: stop if approaching function timeout
      if (Date.now() - functionStartTime > MAX_FUNCTION_TIME_MS) {
        console.log(`Approaching timeout, stopping after ${processed} processed. Remaining: ${unrepliedConvs.length - processed - failed - skipped}`);
        break;
      }
      try {
        // Get recent messages
        const { data: recentMessages } = await supabase
          .from("messages")
          .select("content, sender_type, created_at, media_url, message_type")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(15);

        const latestMessages = (recentMessages || []).reverse();

        // Build unreplied customer messages
        const unrepliedCustomerMessages: string[] = [];
        const unrepliedImageUrls: string[] = [];
        for (let i = latestMessages.length - 1; i >= 0; i--) {
          if (latestMessages[i].sender_type === "customer") {
            if (latestMessages[i].content) unrepliedCustomerMessages.unshift(latestMessages[i].content!);
            if (latestMessages[i].media_url) {
              const mediaUrl = latestMessages[i].media_url!.toLowerCase();
              const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(mediaUrl) ||
                latestMessages[i].message_type === "image" ||
                (!mediaUrl.includes(".mp4") && !mediaUrl.includes(".mp3") && !mediaUrl.includes(".wav") && !mediaUrl.includes(".ogg") && !mediaUrl.includes(".m4a") && !mediaUrl.includes("audioclip") && !mediaUrl.includes("videoclip"));
              if (isImage) {
                unrepliedImageUrls.push(latestMessages[i].media_url!);
              } else {
                unrepliedCustomerMessages.push("[Customer sent an audio/video message]");
              }
            }
          } else break;
        }

        if (unrepliedCustomerMessages.length === 0) {
          skipped++;
          // Reset stuck ai_processing
          if (conv.status === "ai_processing") {
            await supabase.from("conversations").update({ status: "unreplied" }).eq("id", conv.id);
          }
          continue;
        }

        const combinedCustomerMessage = unrepliedCustomerMessages.join("\n");
        const conversationHistory = latestMessages
          .map((m) => `${m.sender_type === "customer" ? "Customer" : "Business"}: ${m.content || (m.media_url ? "[sent media]" : "")}`)
          .join("\n");

        const hasLeadTag = conv.tags?.includes("lead-created") || false;

        // Call AI reply
        const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({
            conversationId: conv.id,
            customerMessage: combinedCustomerMessage,
            conversationHistory,
            pageName: page.page_name,
            businessDescription: page.ai_description || "",
            aiInstructions: page.ai_instructions || "",
            imageUrls: unrepliedImageUrls.length > 0 ? unrepliedImageUrls : undefined,
            hasExistingLead: hasLeadTag,
            mediaAssets: page.ai_media_assets || [],
          }),
        });

        if (!aiResponse.ok) {
          let failReason = "AI service error";
          try {
            const errBody = await aiResponse.json();
            if (aiResponse.status === 402) failReason = "Credits depleted";
            else if (aiResponse.status === 429) failReason = "Rate limit exceeded";
            else if (errBody?.error) failReason = typeof errBody.error === 'string' ? errBody.error.substring(0, 200) : JSON.stringify(errBody.error).substring(0, 200);
          } catch {}
          console.error(`AI reply failed for conv ${conv.id}: ${failReason}`);
          await supabase.from("conversations").update({ 
            status: "ai_failed", 
            ai_fail_reason: failReason 
          }).eq("id", conv.id);
          failed++;
          continue;
        }

        const aiData = await aiResponse.json();
        const suggestedReply = aiData.suggestedReply;

        if (!suggestedReply) {
          console.log(`No reply generated for conv ${conv.id}`);
          skipped++;
          continue;
        }

        // Send to Facebook
        const sendResponse = await fetch("https://graph.facebook.com/v19.0/me/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: conv.participant_id },
            message: { text: suggestedReply },
            access_token: page.page_access_token,
          }),
        });

        if (!sendResponse.ok) {
          const err = await sendResponse.json();
          const errMsg = `Facebook send failed: ${JSON.stringify(err).substring(0, 150)}`;
          console.error(`Facebook send failed for conv ${conv.id}:`, JSON.stringify(err));
          await supabase.from("conversations").update({ 
            status: "ai_failed", 
            ai_fail_reason: errMsg 
          }).eq("id", conv.id);
          failed++;
          continue;
        }

        // Send additional media if AI requested
        const mediaToSend = aiData.mediaToSend;
        if (mediaToSend?.url) {
          let mediaPayload: any;
          if (mediaToSend.type === "image") {
            mediaPayload = { attachment: { type: "image", payload: { url: mediaToSend.url, is_reusable: true } } };
          } else if (mediaToSend.type === "video") {
            mediaPayload = { attachment: { type: "video", payload: { url: mediaToSend.url, is_reusable: true } } };
          }
          if (mediaPayload) {
            await fetch("https://graph.facebook.com/v19.0/me/messages", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: conv.participant_id },
                message: mediaPayload,
                access_token: page.page_access_token,
              }),
            });
          }
        }

        // Store message in DB
        await supabase.from("messages").insert({
          conversation_id: conv.id,
          content: suggestedReply,
          sender_type: "page",
          message_type: "text",
          created_at: new Date().toISOString(),
        });

        // Update conversation status - clear ai_fail_reason on success
        await supabase.from("conversations").update({
          status: "replied",
          ai_fail_reason: null,
          last_message_preview: suggestedReply.substring(0, 100),
          last_message_at: new Date().toISOString(),
        }).eq("id", conv.id);

        // Handle lead creation from AI response
        const leadAction = aiData.leadAction;
        if (leadAction?.should_create && leadAction.phone && !leadAction.invalid_number) {
          const digitsOnly = leadAction.phone.replace(/\D/g, "");
          if (digitsOnly.length >= 10 && !hasLeadTag) {
            const normalizedPhone = digitsOnly.slice(-10);
            const { data: existingLead } = await supabase
              .from("leads")
              .select("id")
              .eq("organization_id", page.organization_id)
              .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone}%`)
              .maybeSingle();

            if (!existingLead) {
              await supabase.from("leads").insert({
                phone: leadAction.phone,
                full_name: conv.participant_name,
                conversation_id: conv.id,
                page_id: page.id,
                source: page.page_name,
                product: page.product_name || null,
                status: "new",
                organization_id: page.organization_id,
                remark: leadAction.reason || "No Inquiry",
              });
              await supabase.from("conversations").update({
                tags: [...(conv.tags || []), "lead-created"],
              }).eq("id", conv.id);
            }
          }
        }

        // Start follow-up if no lead
        if (!hasLeadTag && !conv.tags?.includes("lead-created")) {
          const followupSettings = page.ai_followup_settings as any;
          if (followupSettings?.enabled && followupSettings.steps?.length > 0) {
            const firstStep = followupSettings.steps[0];
            await supabase.from("conversations").update({
              ai_followup_step: 0,
              ai_followup_next_at: new Date(Date.now() + firstStep.delay_hours * 60 * 60 * 1000).toISOString(),
            }).eq("id", conv.id);
          }
        }

        processed++;
        console.log(`Reply sent for conv ${conv.id} (${conv.participant_name})`);

        // Small delay between conversations to avoid Facebook rate limiting (2s instead of holdTime)
        if (processed < unrepliedConvs.length) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (convErr) {
        console.error(`Error processing conv ${conv.id}:`, convErr);
        const reason = convErr instanceof Error ? convErr.message.substring(0, 150) : "Unknown retry error";
        await supabase.from("conversations").update({ 
          status: "ai_failed", 
          ai_fail_reason: reason 
        }).eq("id", conv.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed, failed, skipped, total: unrepliedConvs.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Retry unreplied error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
