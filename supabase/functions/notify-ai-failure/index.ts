// Sends an admin alert email when AI fails (e.g., credits depleted).
// Throttled to once per hour per reason via app_settings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "yogeshnarayanchapai@gmail.com";
const FROM_EMAIL = "SocialBoxx Alerts <onboarding@resend.dev>";
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { reason = "ai_failure", detail = "", pageId = null, orgId = null } = await req.json().catch(() => ({}));

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Throttle per reason
    const settingKey = `last_alert_${reason}`;
    const { data: existing } = await supabase
      .from("app_settings")
      .select("setting_value, updated_at")
      .eq("setting_key", settingKey)
      .is("organization_id", null)
      .maybeSingle();

    if (existing?.updated_at) {
      const lastMs = new Date(existing.updated_at).getTime();
      if (Date.now() - lastMs < COOLDOWN_MS) {
        return new Response(JSON.stringify({ skipped: true, throttled: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const subjectMap: Record<string, string> = {
      credits_depleted: "🚨 SocialBoxx: AI Credits Depleted",
      rate_limited: "⚠️ SocialBoxx: AI Rate Limited",
      ai_failure: "⚠️ SocialBoxx: AI Reply Failure",
    };
    const titleMap: Record<string, string> = {
      credits_depleted: "AI Credits Sakiyo",
      rate_limited: "AI Rate Limit Bhayo",
      ai_failure: "AI Reply Fail Bhayo",
    };

    const subject = subjectMap[reason] || subjectMap.ai_failure;
    const title = titleMap[reason] || titleMap.ai_failure;
    const time = new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#0f172a">
        <h2 style="margin:0 0 12px;color:#dc2626">${title}</h2>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
          AI reply system fail bhayeko cha. Turunta check garnu hola.
        </p>
        <table style="width:100%;font-size:13px;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:6px 0;color:#64748b">Reason</td><td style="padding:6px 0"><b>${reason}</b></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Time (NPT)</td><td style="padding:6px 0">${time}</td></tr>
          ${pageId ? `<tr><td style="padding:6px 0;color:#64748b">Page ID</td><td style="padding:6px 0">${pageId}</td></tr>` : ""}
          ${orgId ? `<tr><td style="padding:6px 0;color:#64748b">Org ID</td><td style="padding:6px 0">${orgId}</td></tr>` : ""}
        </table>
        ${detail ? `<pre style="background:#f1f5f9;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-word">${String(detail).slice(0, 1000)}</pre>` : ""}
        <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">
          ${reason === "credits_depleted" ? "Kripaya Lovable AI Gateway ma credits add garnu hola." : "Edge Function logs ma detail herna sakinxa."}
        </p>
        <p style="margin:24px 0 0;font-size:11px;color:#cbd5e1">— SocialBoxx Alert System</p>
      </div>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ADMIN_EMAIL],
        subject,
        html,
      }),
    });

    const result = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error("Resend send failed:", resp.status, result);
      return new Response(JSON.stringify({ error: "send_failed", detail: result }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update throttle marker
    await supabase.from("app_settings").upsert(
      {
        setting_key: settingKey,
        setting_value: { last_sent: new Date().toISOString(), reason, detail: String(detail).slice(0, 200) },
        organization_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "setting_key" },
    );

    return new Response(JSON.stringify({ ok: true, id: result?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-ai-failure error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
