import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const INTER_MSG_DELAY = 500;

function triggerNextBatch(supabaseUrl: string, key: string, jobId: string) {
  fetch(`${supabaseUrl}/functions/v1/manual-followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ _batchJobId: jobId }),
  }).catch((e) => console.error("trigger batch failed", e));
}

async function sendFb(pageAccessToken: string, recipientId: string, text: string) {
  const body: any = {
    recipient: { id: recipientId },
    message: { text },
    access_token: pageAccessToken,
    messaging_type: "MESSAGE_TAG",
    tag: "HUMAN_AGENT",
  };
  let resp = await fetch("https://graph.facebook.com/v19.0/me/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    // fallback without tag
    const err = await resp.clone().json().catch(() => ({}));
    const code = err?.error?.code;
    if (code === 100 || code === 2018001) {
      delete body.messaging_type;
      delete body.tag;
      resp = await fetch("https://graph.facebook.com/v19.0/me/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `FB send failed (${resp.status})`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { action, jobId, ageHours, message, _batchJobId } = body;

    // === Internal batch processing ===
    if (_batchJobId) {
      const { data: job } = await supabase
        .from("manual_followup_jobs")
        .select("*")
        .eq("id", _batchJobId)
        .single();

      if (!job || job.status !== "running") {
        return new Response(JSON.stringify({ message: "job not running" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pending: string[] = Array.isArray(job.pending_ids) ? [...job.pending_ids] : [];
      if (pending.length === 0) {
        await supabase.from("manual_followup_jobs")
          .update({ status: "completed", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", _batchJobId);
        return new Response(JSON.stringify({ message: "completed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const batch = pending.splice(0, BATCH_SIZE);

      const { data: convs } = await supabase
        .from("conversations")
        .select("id, participant_id, participant_name, page_id, manual_followup_count, connected_pages(page_access_token, page_name)")
        .in("id", batch);

      let processedInc = 0;
      let failedInc = 0;
      const newErrors: any[] = [];

      for (const conv of convs || []) {
        try {
          const page: any = (conv as any).connected_pages;
          if (!page?.page_access_token || !conv.participant_id) {
            throw new Error("Missing page token or recipient");
          }
          await sendFb(page.page_access_token, conv.participant_id, job.message_text);

          await supabase.from("messages").insert({
            conversation_id: conv.id,
            content: job.message_text,
            sender_type: "page",
            message_type: "text",
            created_at: new Date().toISOString(),
          });

          await supabase.from("conversations").update({
            last_message_preview: job.message_text.substring(0, 100),
            last_message_at: new Date().toISOString(),
            manual_followup_count: (conv.manual_followup_count || 0) + 1,
            status: "replied",
          }).eq("id", conv.id);

          processedInc++;
        } catch (e) {
          failedInc++;
          newErrors.push({
            conv_id: conv.id,
            name: conv.participant_name,
            error: (e instanceof Error ? e.message : String(e)).substring(0, 200),
          });
        }
        await new Promise((r) => setTimeout(r, INTER_MSG_DELAY));
      }

      // re-check status (could have been stopped mid-batch)
      const { data: latest } = await supabase
        .from("manual_followup_jobs").select("status, processed, failed, errors").eq("id", _batchJobId).single();

      if (!latest || latest.status === "stopped") {
        return new Response(JSON.stringify({ message: "stopped" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updatedErrors = [...(latest.errors || []), ...newErrors].slice(-200);
      const newProcessed = (latest.processed || 0) + processedInc;
      const newFailed = (latest.failed || 0) + failedInc;
      const done = pending.length === 0;

      await supabase.from("manual_followup_jobs").update({
        pending_ids: pending,
        processed: newProcessed,
        failed: newFailed,
        errors: updatedErrors,
        status: done ? "completed" : "running",
        finished_at: done ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", _batchJobId);

      if (!done) triggerNextBatch(supabaseUrl, serviceKey, _batchJobId);

      return new Response(JSON.stringify({ message: "batch done", processedInc, failedInc, remaining: pending.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === User-facing actions require auth ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();
    if (!membership) throw new Error("No organization found");
    const orgId = membership.organization_id;

    // === Poll active or specific job ===
    if (action === "poll") {
      let query = supabase
        .from("manual_followup_jobs")
        .select("*")
        .eq("organization_id", orgId);
      if (jobId) {
        query = query.eq("id", jobId);
      } else {
        query = query.eq("status", "running");
      }
      const { data: job } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      return new Response(JSON.stringify({ job: job || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Stop ===
    if (action === "stop") {
      if (!jobId) throw new Error("jobId required");
      await supabase.from("manual_followup_jobs").update({
        status: "stopped",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", jobId).eq("organization_id", orgId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Count eligible (preview) ===
    if (action === "count") {
      const ah = Number(ageHours);
      if (!ah || ah < 1) throw new Error("Invalid ageHours");
      const cutoffIso = new Date(Date.now() - ah * 60 * 60 * 1000).toISOString();
      const { data: candConvs } = await supabase
        .from("conversations")
        .select("id, tags")
        .eq("organization_id", orgId)
        .eq("status", "replied")
        .is("deleted_at", null)
        .lt("last_message_at", cutoffIso)
        .limit(5000);
      const filtered = (candConvs || []).filter((c: any) => !(Array.isArray(c.tags) && c.tags.includes("lead-created")));
      let count = 0;
      for (const c of filtered) {
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("sender_type")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastMsg?.sender_type === "page") count++;
      }
      return new Response(JSON.stringify({ count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Start ===
    if (action === "start") {
      const ah = Number(ageHours);
      const msg = String(message || "").trim();
      if (!ah || ah < 1) throw new Error("Invalid ageHours");
      if (!msg) throw new Error("Message required");

      // Refuse if a running job already exists
      const { data: existing } = await supabase
        .from("manual_followup_jobs")
        .select("*")
        .eq("organization_id", orgId)
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ job: existing, existing: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cutoffIso = new Date(Date.now() - ah * 60 * 60 * 1000).toISOString();

      // Candidates: org's conversations where page already replied (status=replied)
      // and last_message_at older than cutoff, with no lead and not deleted.
      const { data: candConvs } = await supabase
        .from("conversations")
        .select("id, tags")
        .eq("organization_id", orgId)
        .eq("status", "replied")
        .is("deleted_at", null)
        .lt("last_message_at", cutoffIso)
        .limit(5000);

      const filtered = (candConvs || []).filter((c: any) => !(Array.isArray(c.tags) && c.tags.includes("lead-created")));

      // Verify last message is from page (not from customer) — only those where AI/page sent the last msg
      const eligible: string[] = [];
      for (const c of filtered) {
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("sender_type")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastMsg?.sender_type === "page") eligible.push(c.id);
      }

      const { data: job, error: jobErr } = await supabase.from("manual_followup_jobs").insert({
        organization_id: orgId,
        created_by: user.id,
        status: eligible.length === 0 ? "completed" : "running",
        age_hours: ah,
        message_text: msg,
        total: eligible.length,
        pending_ids: eligible,
        finished_at: eligible.length === 0 ? new Date().toISOString() : null,
      }).select("*").single();

      if (jobErr) throw jobErr;
      if (eligible.length > 0) triggerNextBatch(supabaseUrl, serviceKey, job.id);

      return new Response(JSON.stringify({ job }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (e) {
    console.error("manual-followup error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
