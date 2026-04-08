import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 25;

const PRIVATE_ATTACHMENT_HOSTS = /(fbcdn\.net|fbsbx\.com|scontent|lookaside\.facebook\.com)/i;
const DOCUMENT_ATTACHMENT_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|csv|ppt|pptx|zip|rar|7z|txt)(\?|$)/i;
const AUDIO_VIDEO_EXTENSIONS = /\.(mp4|mov|avi|webm|mkv|mp3|wav|ogg|m4a|aac)(\?|$)/i;

async function triggerRetryBatch(supabaseUrl: string, supabaseKey: string, jobId: string) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/retry-unreplied`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({ _batchJobId: jobId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to trigger retry batch for job ${jobId}:`, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Failed to trigger retry batch for job ${jobId}:`, error);
    return false;
  }
}

async function processConversation(supabase: any, conv: any, page: any, supabaseUrl: string, supabaseKey: string, retryMarker?: string, retryCount?: number) {
  try {
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("content, sender_type, created_at, media_url, message_type")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(15);

    const latestMessages = (recentMessages || []).reverse();

    const unrepliedCustomerMessages: string[] = [];
    const unrepliedImageUrls: string[] = [];
    for (let i = latestMessages.length - 1; i >= 0; i--) {
      if (latestMessages[i].sender_type === "customer") {
        if (latestMessages[i].content) unrepliedCustomerMessages.unshift(latestMessages[i].content!);
        if (latestMessages[i].media_url) {
          const mediaUrl = latestMessages[i].media_url!.toLowerCase();
          const isFacebookLink = mediaUrl.includes("facebook.com/reel") || mediaUrl.includes("l.facebook.com/l.php") || mediaUrl.includes("fb.watch");
          const isPrivateHostedAttachment = PRIVATE_ATTACHMENT_HOSTS.test(mediaUrl);
          const isDocumentAttachment = DOCUMENT_ATTACHMENT_EXTENSIONS.test(mediaUrl);
          const isAudioOrVideo = AUDIO_VIDEO_EXTENSIONS.test(mediaUrl) || latestMessages[i].message_type === "audio" || latestMessages[i].message_type === "video";
          if (isFacebookLink) {
            unrepliedCustomerMessages.push("[Customer shared a Facebook link/reel]");
          } else if (isDocumentAttachment) {
            unrepliedCustomerMessages.push("[Customer sent a document attachment]");
          } else if (isAudioOrVideo) {
            unrepliedCustomerMessages.push("[Customer sent an audio/video message]");
          } else {
            const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(mediaUrl) ||
              latestMessages[i].message_type === "image" ||
              (!isDocumentAttachment && !isAudioOrVideo && !mediaUrl.includes("audioclip") && !mediaUrl.includes("videoclip"));
            if (isImage) {
              if (isPrivateHostedAttachment) {
                unrepliedCustomerMessages.push("[Customer sent an image attachment]");
              } else {
                unrepliedImageUrls.push(latestMessages[i].media_url!);
              }
            } else {
              unrepliedCustomerMessages.push("[Customer sent an attachment]");
            }
          }
        }
      } else break;
    }

    if (unrepliedCustomerMessages.length === 0) {
      const isFollowupFail = conv.ai_fail_reason?.includes("Followup") || conv.ai_fail_reason?.includes("followup");
      if (isFollowupFail) {
        const failReason = conv.ai_fail_reason || "";
        const isPermanent = failReason.includes("#551") || failReason.includes("(#10)") || failReason.includes("#10,");
        if (isPermanent) {
          await supabase.from("conversations").update({
            status: "replied",
            ai_fail_reason: null,
            last_message_preview: "⚠️ User unavailable on Facebook",
          }).eq("id", conv.id);
        } else {
          await supabase.from("conversations").update({
            status: "replied",
            ai_fail_reason: null,
            ai_followup_next_at: new Date().toISOString(),
          }).eq("id", conv.id);
        }
        return { processed: 1, failed: 0, type: "followup" };
      }

      if (conv.status === "ai_processing") {
        await supabase.from("conversations").update({ status: "unreplied" }).eq("id", conv.id);
      }
      return { processed: 0, failed: 0, skipped: 1 };
    }

    const combinedCustomerMessage = unrepliedCustomerMessages.join("\n");
    const conversationHistory = latestMessages
      .map((m: any) => `${m.sender_type === "customer" ? "Customer" : "Business"}: ${m.content || (m.media_url ? "[sent media]" : "")}`)
      .join("\n");

    const hasLeadTag = conv.tags?.includes("lead-created") || false;

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
        pageId: page.id,
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
      const markedReason = retryMarker ? `${retryMarker} ${failReason}` : failReason;
      await supabase.from("conversations").update({ status: "ai_failed", ai_fail_reason: markedReason }).eq("id", conv.id);
      return { processed: 0, failed: 1, type: "new_reply" };
    }

    const aiData = await aiResponse.json();
    const suggestedReply = aiData.suggestedReply;

    if (!suggestedReply) {
      return { processed: 0, failed: 0, skipped: 1 };
    }

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
      const fbErrorCode = err?.error?.code;
      const isPermanent = fbErrorCode === 551 || fbErrorCode === 10;
      const errMsg = isPermanent
        ? "User unavailable on Facebook (blocked or deactivated)"
        : `Facebook send failed: ${JSON.stringify(err).substring(0, 150)}`;
      const markedErrMsg = (!isPermanent && retryMarker) ? `${retryMarker} ${errMsg}` : (isPermanent ? null : errMsg);
      await supabase.from("conversations").update({
        status: isPermanent ? "replied" : "ai_failed",
        ai_fail_reason: isPermanent ? null : markedErrMsg,
        ...(isPermanent ? { last_message_preview: "⚠️ User unavailable on Facebook" } : {}),
      }).eq("id", conv.id);
      return { processed: isPermanent ? 1 : 0, failed: isPermanent ? 0 : 1, type: "new_reply" };
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

    await supabase.from("messages").insert({
      conversation_id: conv.id,
      content: suggestedReply,
      sender_type: "page",
      message_type: "text",
      created_at: new Date().toISOString(),
    });

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

    console.log(`Reply sent for conv ${conv.id} (${conv.participant_name})`);
    return { processed: 1, failed: 0, type: "new_reply" };
  } catch (convErr) {
    console.error(`Error processing conv ${conv.id}:`, convErr);
    const reason = convErr instanceof Error ? convErr.message.substring(0, 150) : "Unknown retry error";
    const markedReason = retryMarker ? `${retryMarker} ${reason}` : reason;
    await supabase.from("conversations").update({ status: "ai_failed", ai_fail_reason: markedReason }).eq("id", conv.id);
    return { processed: 0, failed: 1 };
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

    const body = await req.json();
    const { pageId, conversationId, bulkRetry, jobId: pollJobId, _batchJobId, _batchOffset } = body;

    // Check if this is an internal batch call (no auth needed — uses service key header check)
    const isInternalBatch = !!_batchJobId;

    if (!isInternalBatch) {
      // User-facing calls require auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("No authorization header");
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) throw new Error("Unauthorized");

      // === POLL MODE ===
      if (pollJobId) {
        const { data: job } = await supabase
          .from("retry_jobs")
          .select("*")
          .eq("id", pollJobId)
          .single();
        return new Response(JSON.stringify(job || { error: "Job not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === BULK RETRY MODE: initiate job ===
      if (bulkRetry) {
        const { data: membership } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .single();
        if (!membership) throw new Error("No organization found");
        const orgId = membership.organization_id;

        // Check for existing running job
        const { data: existingJob } = await supabase
          .from("retry_jobs")
          .select("id, status, total, processed, failed, new_msg_fail, followup_fail, unavailable_cleared, created_at, updated_at")
          .eq("organization_id", orgId)
          .eq("status", "running")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingJob) {
          const lastUpdatedAt = existingJob.updated_at ? new Date(existingJob.updated_at).getTime() : 0;
          const isStale = existingJob.processed < existingJob.total && (Date.now() - lastUpdatedAt > 45_000);

          if (isStale) {
            await triggerRetryBatch(supabaseUrl, supabaseKey, existingJob.id);
          }

          return new Response(JSON.stringify({ jobId: existingJob.id, existing: true, resumed: isStale, ...existingJob }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch all AI failed conversations
        const { data: allFailedConvs } = await supabase
          .from("conversations")
          .select("id, ai_fail_reason, ai_followup_step, status, page_id")
          .in("status", ["ai_failed", "ai_processing"])
          .eq("organization_id", orgId)
          .is("deleted_at", null);

        if (!allFailedConvs || allFailedConvs.length === 0) {
          return new Response(JSON.stringify({ jobId: null, total: 0, message: "No AI failed conversations" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Pre-filter unavailable users
        const personNotAvailable = allFailedConvs.filter(c => {
          const reason = (c.ai_fail_reason || "").toLowerCase();
          return reason.includes("person not available") || reason.includes("user unavailable") || reason.includes("(#551)") || reason.includes("(#10)");
        });
        const retryableConvs = allFailedConvs.filter(c => {
          const reason = (c.ai_fail_reason || "").toLowerCase();
          return !(reason.includes("person not available") || reason.includes("user unavailable") || reason.includes("(#551)") || reason.includes("(#10)"));
        });

        // Mark unavailable as replied
        if (personNotAvailable.length > 0) {
          await supabase
            .from("conversations")
            .update({ status: "replied", ai_fail_reason: null, last_message_preview: "⚠️ User unavailable on Facebook" })
            .in("id", personNotAvailable.map(c => c.id));
        }

        const newMsgFail = retryableConvs.filter(c => {
          const isFollowup = c.ai_fail_reason?.includes("Followup") || c.ai_fail_reason?.includes("followup");
          return !isFollowup;
        }).length;
        const followupFail = retryableConvs.length - newMsgFail;

        if (retryableConvs.length === 0) {
          return new Response(JSON.stringify({
            jobId: null, total: 0,
            unavailable_cleared: personNotAvailable.length,
            message: "No retryable conversations"
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Store conversation IDs in the job for batch processing
        const { data: job, error: jobErr } = await supabase
          .from("retry_jobs")
          .insert({
            organization_id: orgId,
            status: "running",
            total: retryableConvs.length,
            processed: 0,
            failed: 0,
            new_msg_fail: newMsgFail,
            followup_fail: followupFail,
            unavailable_cleared: personNotAvailable.length,
          })
          .select("id")
          .single();

        if (jobErr || !job) throw new Error("Failed to create retry job");

        // Trigger first batch asynchronously via self-invocation
        await triggerRetryBatch(supabaseUrl, supabaseKey, job.id);

        return new Response(JSON.stringify({
          jobId: job.id,
          total: retryableConvs.length,
          newMsgFail,
          followupFail,
          unavailable_cleared: personNotAvailable.length,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // === SINGLE CONVERSATION RETRY ===
      if (conversationId) {
        const { data: conv } = await supabase
          .from("conversations")
          .select("*, connected_pages(*)")
          .eq("id", conversationId)
          .single();
        if (!conv) throw new Error("Conversation not found");

        const page = conv.connected_pages;
        if (!page) throw new Error("Page not found");

        const result = await processConversation(supabase, conv, page, supabaseUrl, supabaseKey);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("Invalid request");
    }

    // === INTERNAL BATCH PROCESSING ===
    const jobId = _batchJobId;

    // Get job details
    const { data: job } = await supabase
      .from("retry_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job || job.status !== "running") {
      return new Response(JSON.stringify({ message: "Job not running" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = job.organization_id;

    // Fetch failed convs, excluding ones already attempted in this job (marked with [retried:jobId])
    const retryMarker = `[retried:${jobId}]`;
    const MAX_RETRY_ATTEMPTS = 2;
    const { data: allFailedConvs } = await supabase
      .from("conversations")
      .select("id, ai_fail_reason, ai_followup_step, status, page_id, participant_id, participant_name, tags")
      .in("status", ["ai_failed", "ai_processing"])
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    const retryableConvs: typeof allFailedConvs = [];
    const permanentlyFailed: string[] = [];

    for (const c of (allFailedConvs || [])) {
      const reason = (c.ai_fail_reason || "");
      const reasonLower = reason.toLowerCase();
      // Skip already-attempted in this job
      if (reason.includes(retryMarker)) continue;
      // Skip permanently unavailable users
      if (reasonLower.includes("person not available") || reasonLower.includes("user unavailable") || reasonLower.includes("(#551)") || reasonLower.includes("(#10)")) continue;
      // Check retry count - skip if already retried MAX times
      const retryCountMatch = reason.match(/\[retryCount:(\d+)\]/);
      const retryCount = retryCountMatch ? parseInt(retryCountMatch[1], 10) : 0;
      if (retryCount >= MAX_RETRY_ATTEMPTS) {
        permanentlyFailed.push(c.id);
        continue;
      }
      (c as any)._retryCount = retryCount;
      retryableConvs.push(c);
    }

    // Mark permanently failed conversations so they stop being retried
    if (permanentlyFailed.length > 0) {
      console.log(`Skipping ${permanentlyFailed.length} conversations that exceeded ${MAX_RETRY_ATTEMPTS} retry attempts`);
      // Update job processed count for skipped ones
      const { data: curJob } = await supabase.from("retry_jobs").select("processed").eq("id", jobId).single();
      await supabase.from("retry_jobs").update({
        processed: (curJob?.processed || 0) + permanentlyFailed.length,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
    }

    if (retryableConvs.length === 0) {
      // No more conversations — mark job complete and clean up retry markers
      await supabase
        .from("retry_jobs")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      // Clean up retry markers from ai_fail_reason
      const { data: markedConvs } = await supabase
        .from("conversations")
        .select("id, ai_fail_reason")
        .eq("organization_id", orgId)
        .like("ai_fail_reason", `%${retryMarker}%`);
      for (const mc of (markedConvs || [])) {
        const cleanReason = (mc.ai_fail_reason || "").replace(retryMarker, "").trim();
        await supabase.from("conversations").update({ ai_fail_reason: cleanReason }).eq("id", mc.id);
      }

      console.log(`Retry job ${jobId} completed`);
      return new Response(JSON.stringify({ message: "Job completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get pages for this batch
    const pageIds = [...new Set(retryableConvs.map(c => c.page_id))];
    const { data: pagesData } = await supabase
      .from("connected_pages")
      .select("id, page_id, page_name, page_access_token, ai_enabled, ai_description, ai_instructions, ai_debounce_seconds, ai_media_assets, product_name, organization_id, ai_followup_settings")
      .in("id", pageIds);
    const pagesMap = new Map((pagesData || []).map(p => [p.id, p]));

    let batchProcessed = 0;
    let batchFailed = 0;

    // Process this batch sequentially with 1s delay
    for (let i = 0; i < retryableConvs.length; i++) {
      const conv = retryableConvs[i];
      const page = pagesMap.get(conv.page_id);
      const result = page
        ? await processConversation(supabase, conv, page, supabaseUrl, supabaseKey, retryMarker)
        : { processed: 0, failed: 1 };

      if (!page) {
        await supabase.from("conversations").update({ ai_fail_reason: `${retryMarker} Page not found` }).eq("id", conv.id);
        batchFailed++;
      }

      batchProcessed += result.processed || 0;
      batchFailed += result.failed || 0;

      // Update job progress using increment via re-fetch
      const { data: currentJob } = await supabase
        .from("retry_jobs")
        .select("processed, failed")
        .eq("id", jobId)
        .single();
      await supabase
        .from("retry_jobs")
        .update({
          processed: (currentJob?.processed || 0) + 1,
          failed: (currentJob?.failed || 0) + (result.failed || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      // 1 second delay between messages (except last in batch)
      if (i < retryableConvs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Batch done: ${batchProcessed} processed, ${batchFailed} failed`);

    // Check if we've processed enough — stop to prevent infinite loop
    const { data: latestJob } = await supabase
      .from("retry_jobs")
      .select("processed, total")
      .eq("id", jobId)
      .single();

    if (latestJob && latestJob.processed >= latestJob.total) {
      await supabase
        .from("retry_jobs")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      // Clean up retry markers
      const { data: markedConvs } = await supabase
        .from("conversations")
        .select("id, ai_fail_reason")
        .eq("organization_id", orgId)
        .like("ai_fail_reason", `%${retryMarker}%`);
      for (const mc of (markedConvs || [])) {
        const cleanReason = (mc.ai_fail_reason || "").replace(retryMarker, "").trim();
        await supabase.from("conversations").update({ ai_fail_reason: cleanReason }).eq("id", mc.id);
      }
      console.log(`Retry job ${jobId} completed (processed ${latestJob.processed}/${latestJob.total})`);
      return new Response(JSON.stringify({ message: "Job completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trigger next batch
    await triggerRetryBatch(supabaseUrl, supabaseKey, jobId);

    return new Response(JSON.stringify({ message: "Batch done" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("retry-unreplied error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
