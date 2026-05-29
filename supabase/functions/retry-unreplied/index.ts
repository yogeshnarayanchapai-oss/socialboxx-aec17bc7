import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 15;
const RETRY_SCAN_PAGE_SIZE = 300;
const MAX_REPLY_LENGTH = 1900;
const INTER_MESSAGE_DELAY_MS = 400;

// Phone extraction: detects +977 / 977 / 97XXXXXXXX / 98XXXXXXXX anywhere in text
function extractNepalPhone(text: string): string | null {
  if (!text) return null;
  const normalized = text.replace(/[\s\-().]/g, "");
  const match = normalized.match(/(?:\+?977)?(9[78]\d{8})(?!\d)/);
  return match ? match[1] : null;
}

const PRIVATE_ATTACHMENT_HOSTS = /(fbcdn\.net|fbsbx\.com|scontent|lookaside\.facebook\.com)/i;
const DOCUMENT_ATTACHMENT_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|csv|ppt|pptx|zip|rar|7z|txt)(\?|$)/i;
const AUDIO_VIDEO_EXTENSIONS = /\.(mp4|mov|avi|webm|mkv|mp3|wav|ogg|m4a|aac)(\?|$)/i;

function triggerRetryBatch(supabaseUrl: string, supabaseKey: string, jobId: string, scanMode: "failed" | "unreplied" | "all" = "failed") {
  // Fire-and-forget: do NOT await the response. The next batch runs in its own
  // function instance so the current instance can return immediately and avoid
  // hitting the edge-function execution-time limit when chaining many batches.
  try {
    fetch(`${supabaseUrl}/functions/v1/retry-unreplied`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({ _batchJobId: jobId, _scanMode: scanMode }),
    }).catch((err) => console.error(`Trigger batch fetch failed for job ${jobId}:`, err));
  } catch (error) {
    console.error(`Failed to trigger retry batch for job ${jobId}:`, error);
  }
  return true;
}

function isPermanentlyUnavailable(reason?: string | null) {
  const reasonLower = (reason || "").toLowerCase();
  // ONLY truly blocked / deactivated users are permanent.
  // Outside-window and other transient FB errors should keep retrying.
  return reasonLower.includes("person not available") ||
    reasonLower.includes("user unavailable") ||
    reasonLower.includes("blocked or deactivated") ||
    reasonLower.includes("(#551)");
}

async function loadRetryableBatch(supabase: any, orgId: string, retryMarker: string, scanMode: "failed" | "unreplied" | "all" = "failed") {
  const candidates: any[] = [];
  let from = 0;

  const statusFilter = scanMode === "unreplied"
    ? ["unreplied"]
    : scanMode === "all"
      ? ["ai_failed", "ai_processing", "unreplied"]
      : ["ai_failed", "ai_processing"];

  while (candidates.length < BATCH_SIZE) {
    const { data: pageConvs, error } = await supabase
      .from("conversations")
      .select("id, ai_fail_reason, ai_followup_step, status, page_id, participant_id, participant_name, tags")
      .in("status", statusFilter)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, from + RETRY_SCAN_PAGE_SIZE - 1);

    if (error) throw error;
    if (!pageConvs || pageConvs.length === 0) break;

    for (const conv of pageConvs) {
      const reason = conv.ai_fail_reason || "";
      if (reason.includes(retryMarker)) continue;
      if (isPermanentlyUnavailable(reason)) continue;
      // Skip conversations already converted to a lead
      if (Array.isArray(conv.tags) && conv.tags.includes("lead-created")) continue;

      const retryCountMatch = reason.match(/\[retryCount:(\d+)\]/);
      (conv as any)._retryCount = retryCountMatch ? parseInt(retryCountMatch[1], 10) : 0;
      candidates.push(conv);

      if (candidates.length >= BATCH_SIZE) break;
    }

    if (pageConvs.length < RETRY_SCAN_PAGE_SIZE) break;
    from += RETRY_SCAN_PAGE_SIZE;
  }

  return candidates;
}

async function cleanupRetryMarkers(supabase: any, orgId: string, retryMarker: string) {
  const { data: markedConvs } = await supabase
    .from("conversations")
    .select("id, ai_fail_reason")
    .eq("organization_id", orgId)
    .like("ai_fail_reason", `%${retryMarker}%`);

  for (const mc of (markedConvs || [])) {
    const cleanReason = (mc.ai_fail_reason || "")
      .replace(retryMarker, "")
      .replace(/\[retryCount:\d+\]/g, "")
      .trim();
    await supabase.from("conversations").update({ ai_fail_reason: cleanReason || null }).eq("id", mc.id);
  }
}

// Pre-pass: scan unreplied conversations and mark as 'replied' if the latest
// message in the conversation is from the page (already responded) — these are
// status drift, not actual unanswered messages. Returns count of corrected rows.
async function correctUnrepliedStatusDrift(supabase: any, orgId: string): Promise<number> {
  let corrected = 0;
  const PAGE_SIZE = 500;
  let from = 0;

  while (true) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("status", "unreplied")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .range(from, from + PAGE_SIZE - 1);

    if (!convs || convs.length === 0) break;

    // Fetch last message per conversation in batch
    for (const c of convs) {
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("sender_type")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastMsg && lastMsg.sender_type === "page") {
        await supabase.from("conversations")
          .update({ status: "replied", ai_fail_reason: null })
          .eq("id", c.id);
        corrected++;
      }
    }

    if (convs.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return corrected;
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
    const lastMessage = latestMessages[latestMessages.length - 1];

    const unrepliedCustomerMessages: string[] = [];
    const unrepliedImageUrls: string[] = [];
    for (let i = latestMessages.length - 1; i >= 0; i--) {
      if (latestMessages[i].sender_type === "customer") {
        if (latestMessages[i].content) unrepliedCustomerMessages.unshift(latestMessages[i].content!);
        if (latestMessages[i].media_url) {
          const mediaUrl = latestMessages[i].media_url!.toLowerCase();
          const isLinkShare =
            mediaUrl.includes("facebook.com/reel") ||
            mediaUrl.includes("l.facebook.com/l.php") ||
            mediaUrl.includes("fb.watch") ||
            mediaUrl.includes("instagram.com/reel") ||
            mediaUrl.includes("instagram.com/p/") ||
            mediaUrl.includes("youtu.be") ||
            mediaUrl.includes("youtube.com") ||
            mediaUrl.includes("fb.me");
          const isPrivateHostedAttachment = PRIVATE_ATTACHMENT_HOSTS.test(mediaUrl);
          const isDocumentAttachment = DOCUMENT_ATTACHMENT_EXTENSIONS.test(mediaUrl);
          const isAudioOrVideo = AUDIO_VIDEO_EXTENSIONS.test(mediaUrl) || latestMessages[i].message_type === "audio" || latestMessages[i].message_type === "video";
          if (isLinkShare) {
            unrepliedCustomerMessages.push("[Customer shared a link/reel]");
          } else if (isDocumentAttachment) {
            unrepliedCustomerMessages.push("[Customer sent a document attachment]");
          } else if (isAudioOrVideo) {
            unrepliedCustomerMessages.push("[Customer sent an audio/video message]");
          } else {
            const isImage =
              latestMessages[i].message_type === "image" ||
              /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(mediaUrl) ||
              (isPrivateHostedAttachment && !isDocumentAttachment && !isAudioOrVideo);
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

    // === AUTO LEAD CREATION FROM PHONE ===
    // If any customer message contains a Nepal phone number, create a lead and
    // mark the conversation as replied — bypassing the AI call entirely.
    const hasLeadTagAlready = conv.tags?.includes("lead-created") || false;
    if (!hasLeadTagAlready) {
      const allCustomerTexts = (recentMessages || [])
        .filter((m: any) => m.sender_type === "customer" && m.content)
        .map((m: any) => m.content as string);
      let foundPhone: string | null = null;
      for (const txt of allCustomerTexts) {
        const p = extractNepalPhone(txt);
        if (p) { foundPhone = p; break; }
      }

      if (foundPhone) {
        const { data: existingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("organization_id", page.organization_id)
          .or(`phone.eq.${foundPhone},phone.ilike.%${foundPhone}%`)
          .maybeSingle();

        if (!existingLead) {
          const inquiryTexts = allCustomerTexts.filter((t: string) => {
            const stripped = t.replace(/[\s\-().+]/g, "");
            return t.trim().length > 0 && !/^\d{9,}$/.test(stripped);
          });
          const remark = inquiryTexts.length > 0
            ? inquiryTexts.join(" | ").substring(0, 500)
            : "No Inquiry";
          const lastCustomerMsg = allCustomerTexts.slice(-1)[0]?.substring(0, 200) || null;

          await supabase.from("leads").insert({
            phone: foundPhone,
            full_name: conv.participant_name,
            conversation_id: conv.id,
            page_id: page.id,
            source: page.page_name,
            product: page.product_name || null,
            status: "new",
            organization_id: page.organization_id,
            remark,
            last_message: lastCustomerMsg,
          });
        }

        const newTags = [...(conv.tags || []).filter((t: string) => t !== "new" && t !== "follow-up")];
        if (!newTags.includes("lead-created")) newTags.push("lead-created");
        await supabase.from("conversations").update({
          status: "replied",
          ai_fail_reason: null,
          tags: newTags,
        }).eq("id", conv.id);

        console.log(`Auto-lead created from retry for conv ${conv.id} phone ${foundPhone}`);
        return { processed: 1, failed: 0, type: "auto_lead" };
      }
    }

    if (unrepliedCustomerMessages.length === 0) {
      const isFollowupFail = conv.ai_fail_reason?.includes("Followup") || conv.ai_fail_reason?.includes("followup");
      if (isFollowupFail) {
        const failReason = conv.ai_fail_reason || "";
        const isPermanent = isPermanentlyUnavailable(failReason);
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

      const recoveredStatus = lastMessage?.sender_type === "page" ? "replied" : "unreplied";
      await supabase.from("conversations").update({
        status: recoveredStatus,
        ai_fail_reason: null,
      }).eq("id", conv.id);
      return { processed: 1, failed: 0, type: "recovered" };
    }

    // === SEND FIRST TEMPLATE (NO AI CALL) ===
    // Conversation has unreplied customer messages and no lead. Per business rule
    // we send the page's first template (or the auto_reply_first_message fallback)
    // directly — no AI cost, no AI call.
    const hasLeadTag = conv.tags?.includes("lead-created") || false;
    if (hasLeadTag) {
      await supabase.from("conversations").update({
        status: "replied",
        ai_fail_reason: null,
      }).eq("id", conv.id);
      return { processed: 1, failed: 0, type: "skipped_has_lead" };
    }

    const tmplCfg: any = (page as any).first_msg_template;
    const tmplList: any[] = Array.isArray(tmplCfg?.messages)
      ? tmplCfg.messages.filter((m: any) => m && (m.text || m.media))
      : [];
    const firstTmpl = tmplList[0];
    const templateText: string = (firstTmpl?.text || page.auto_reply_first_message || "").toString().trim();
    const templateMedia = firstTmpl?.media || null;

    if (!templateText && !templateMedia) {
      const failReason = retryMarker ? `${retryMarker} No first template configured` : "No first template configured";
      await supabase.from("conversations").update({ status: "ai_failed", ai_fail_reason: failReason }).eq("id", conv.id);
      return { processed: 0, failed: 1, type: "new_reply" };
    }

    const fbBody: any = {
      recipient: { id: conv.participant_id },
      access_token: page.page_access_token,
    };
    if (templateMedia?.url) {
      fbBody.message = {
        attachment: {
          type: templateMedia.type === "video" ? "video" : "image",
          payload: { url: templateMedia.url, is_reusable: true },
        },
      };
    } else {
      fbBody.message = { text: templateText };
    }

    let sendResponse = await fetch("https://graph.facebook.com/v19.0/me/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fbBody),
    });

    if (!sendResponse.ok) {
      const errClone = sendResponse.clone();
      try {
        const errPeek = await errClone.json();
        const subcode = errPeek?.error?.error_subcode;
        const msg = String(errPeek?.error?.message || "").toLowerCase();
        const isOutsideWindow = subcode === 2018278 || msg.includes("outside of allowed window") || msg.includes("outside the allowed window");
        if (isOutsideWindow) {
          sendResponse = await fetch("https://graph.facebook.com/v19.0/me/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...fbBody, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }),
          });
        }
      } catch (_) {}
    }

    if (!sendResponse.ok) {
      const err = await sendResponse.json();
      const fbErrorCode = err?.error?.code;
      const fbErrorMessage = String(err?.error?.message || "");
      const isPermanent = fbErrorCode === 551 || isPermanentlyUnavailable(fbErrorMessage);
      const errMsg = isPermanent
        ? "User unavailable on Facebook (blocked or deactivated)"
        : `Facebook send failed: ${JSON.stringify(err).substring(0, 150)}`;
      const newRetryCount2 = (retryCount || 0) + 1;
      const retryCountTag2 = `[retryCount:${newRetryCount2}]`;
      const markedErrMsg = (!isPermanent && retryMarker) ? `${retryMarker} ${retryCountTag2} ${errMsg}` : (isPermanent ? errMsg : `${retryCountTag2} ${errMsg}`);
      await supabase.from("conversations").update({
        status: isPermanent ? "replied" : "ai_failed",
        ai_fail_reason: markedErrMsg,
        ...(isPermanent ? { last_message_preview: "⚠️ User unavailable on Facebook" } : {}),
      }).eq("id", conv.id);
      return { processed: isPermanent ? 1 : 0, failed: isPermanent ? 0 : 1, type: "new_reply" };
    }

    await supabase.from("messages").insert({
      conversation_id: conv.id,
      content: templateText || null,
      sender_type: "page",
      message_type: templateMedia ? "media" : "text",
      media_url: templateMedia?.url || null,
      created_at: new Date().toISOString(),
    });

    await supabase.from("conversations").update({
      status: "replied",
      ai_fail_reason: null,
      last_message_preview: (templateText || "[Template sent]").substring(0, 100),
      last_message_at: new Date().toISOString(),
    }).eq("id", conv.id);

    // Start auto follow-up sequence (no lead exists)
    const followupMessages = (page as any).auto_followup_messages;
    if (Array.isArray(followupMessages) && followupMessages.length > 0) {
      const firstStep = followupMessages[0];
      const delayHours = Number(firstStep?.delay_hours ?? firstStep?.delay ?? 6);
      await supabase.from("conversations").update({
        auto_followup_step: 0,
        auto_followup_next_at: new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString(),
      }).eq("id", conv.id);
    }

    console.log(`Template sent for conv ${conv.id} (${conv.participant_name})`);
    return { processed: 1, failed: 0, type: "new_reply" };
  } catch (convErr) {
    console.error(`Error processing conv ${conv.id}:`, convErr);
    const reason = convErr instanceof Error ? convErr.message.substring(0, 150) : "Unknown retry error";
    const newRetryCount = (retryCount || 0) + 1;
    const retryCountTag = `[retryCount:${newRetryCount}]`;
    const markedReason = retryMarker ? `${retryMarker} ${retryCountTag} ${reason}` : `${retryCountTag} ${reason}`;
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
    const { pageId, conversationId, bulkRetry, jobId: pollJobId, _batchJobId, _batchOffset, _autoCron, organization_id: cronOrgId, _scanMode: rawScanMode, scan_mode: publicScanMode } = body;

    // Check if this is an internal batch call (no auth needed — uses service key header check)
    const isInternalBatch = !!_batchJobId;
    const isAutoCron = !!_autoCron;
    const incomingMode = rawScanMode || publicScanMode;
    const scanMode: "failed" | "unreplied" | "all" =
      incomingMode === "unreplied" || incomingMode === "all" ? incomingMode : "failed";

    // === AUTO CRON MODE: kick off bulk retry for a specific org without user auth ===
    if (isAutoCron && cronOrgId) {
      const { data: existingJob } = await supabase
        .from("retry_jobs")
        .select("id, updated_at")
        .eq("organization_id", cronOrgId)
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingJob) {
        const lastUpdatedAt = existingJob.updated_at ? new Date(existingJob.updated_at).getTime() : 0;
        const isStale = Date.now() - lastUpdatedAt > 45_000;
        if (isStale) triggerRetryBatch(supabaseUrl, supabaseKey, existingJob.id, scanMode);
        return new Response(JSON.stringify({ message: "Job already running", jobId: existingJob.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Pre-pass: correct status drift for unreplied where page already replied.
      let driftCorrected = 0;
      if (scanMode === "unreplied" || scanMode === "all") {
        try {
          driftCorrected = await correctUnrepliedStatusDrift(supabase, cronOrgId);
        } catch (e) {
          console.error("Status drift correction failed:", e);
        }
      }

      const candidateStatuses = scanMode === "unreplied"
        ? ["unreplied"]
        : scanMode === "all"
          ? ["ai_failed", "ai_processing", "unreplied"]
          : ["ai_failed", "ai_processing"];

      const { data: allFailedConvs } = await supabase
        .from("conversations")
        .select("id, ai_fail_reason, page_id, status, tags")
        .in("status", candidateStatuses)
        .eq("organization_id", cronOrgId)
        .is("deleted_at", null);

      if (!allFailedConvs || allFailedConvs.length === 0) {
        return new Response(JSON.stringify({ message: "No convs to retry", drift_corrected: driftCorrected }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Skip conversations already converted to a lead
      const nonLeadConvs = allFailedConvs.filter((c: any) => !(Array.isArray(c.tags) && c.tags.includes("lead-created")));
      const personNotAvailable = nonLeadConvs.filter(c => isPermanentlyUnavailable(c.ai_fail_reason));
      const retryableConvs = nonLeadConvs.filter(c => !isPermanentlyUnavailable(c.ai_fail_reason));

      if (personNotAvailable.length > 0) {
        await supabase.from("conversations")
          .update({ status: "replied", ai_fail_reason: null, last_message_preview: "⚠️ User unavailable on Facebook" })
          .in("id", personNotAvailable.map(c => c.id));
      }

      if (retryableConvs.length === 0) {
        return new Response(JSON.stringify({ message: "Only unavailable cleared", unavailable_cleared: personNotAvailable.length, drift_corrected: driftCorrected }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newMsgFail = retryableConvs.filter(c => {
        const isFollowup = c.ai_fail_reason?.includes("Followup") || c.ai_fail_reason?.includes("followup");
        return !isFollowup;
      }).length;

      const { data: job } = await supabase.from("retry_jobs").insert({
        organization_id: cronOrgId,
        status: "running",
        total: retryableConvs.length,
        processed: 0,
        failed: 0,
        new_msg_fail: newMsgFail,
        followup_fail: retryableConvs.length - newMsgFail,
        unavailable_cleared: personNotAvailable.length,
      }).select("id").single();

      if (job) triggerRetryBatch(supabaseUrl, supabaseKey, job.id, scanMode);

      return new Response(JSON.stringify({ message: "Auto-cron job started", jobId: job?.id, total: retryableConvs.length, drift_corrected: driftCorrected, scan_mode: scanMode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
          .select("id, ai_fail_reason, ai_followup_step, status, page_id, tags")
          .in("status", ["ai_failed", "ai_processing"])
          .eq("organization_id", orgId)
          .is("deleted_at", null);

        if (!allFailedConvs || allFailedConvs.length === 0) {
          return new Response(JSON.stringify({ jobId: null, total: 0, message: "No AI failed conversations" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Skip conversations already converted to a lead
        const nonLeadConvs = allFailedConvs.filter((c: any) => !(Array.isArray(c.tags) && c.tags.includes("lead-created")));
        const personNotAvailable = nonLeadConvs.filter(c => isPermanentlyUnavailable(c.ai_fail_reason));
        const retryableConvs = nonLeadConvs.filter(c => !isPermanentlyUnavailable(c.ai_fail_reason));

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

    // Fetch next retryable batch for this job. We scan pages of records so earlier failed rows
    // from this same job do not block later conversations from being processed.
    const retryMarker = `[retried:${jobId}]`;
    const retryableConvs = await loadRetryableBatch(supabase, orgId, retryMarker, scanMode);

    if (retryableConvs.length === 0) {
      // No more conversations — mark job complete and clean up retry markers
      await supabase
        .from("retry_jobs")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      // Clean up retry markers from ai_fail_reason
      await cleanupRetryMarkers(supabase, orgId, retryMarker);

      console.log(`Retry job ${jobId} completed`);
      return new Response(JSON.stringify({ message: "Job completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get pages for this batch
    const pageIds = [...new Set(retryableConvs.map(c => c.page_id))];
    const { data: pagesData } = await supabase
      .from("connected_pages")
      .select("id, page_id, page_name, page_access_token, ai_enabled, ai_description, ai_instructions, ai_debounce_seconds, ai_media_assets, product_name, organization_id, ai_followup_settings, auto_reply_first_message, auto_reply_followup, first_msg_template, first_msg_template_enabled, auto_followup_messages")
      .in("id", pageIds);
    const pagesMap = new Map((pagesData || []).map(p => [p.id, p]));

    let batchProcessed = 0;
    let batchFailed = 0;

    // Process this batch sequentially with 1s delay
    for (let i = 0; i < retryableConvs.length; i++) {
      const conv = retryableConvs[i];
      const page = pagesMap.get(conv.page_id);
      const convRetryCount = (conv as any)._retryCount || 0;
      const result = page
        ? await processConversation(supabase, conv, page, supabaseUrl, supabaseKey, retryMarker, convRetryCount)
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

      // Short delay between messages (except last in batch) to avoid FB rate limits
      if (i < retryableConvs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, INTER_MESSAGE_DELAY_MS));
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
      await cleanupRetryMarkers(supabase, orgId, retryMarker);
      console.log(`Retry job ${jobId} completed (processed ${latestJob.processed}/${latestJob.total})`);
      return new Response(JSON.stringify({ message: "Job completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trigger next batch
    await triggerRetryBatch(supabaseUrl, supabaseKey, jobId, scanMode);

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
