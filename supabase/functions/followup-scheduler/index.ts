import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Nepal Time: UTC+5:45
function nepalNowHHMM(): string {
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nptTotal = (utcMin + 5 * 60 + 45) % (24 * 60);
  const hh = Math.floor(nptTotal / 60);
  const mm = nptTotal % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const npNow = nepalNowHHMM();
    const [nh, nm] = npNow.split(":").map(Number);
    const npMinutes = nh * 60 + nm;

    // Read all orgs' followup_enabled + followup_schedule_times rows
    const { data: settingsRows, error } = await supabase
      .from("app_settings")
      .select("organization_id, setting_key, setting_value")
      .in("setting_key", ["followup_enabled", "followup_schedule_times"]);

    if (error) throw error;

    const byOrg = new Map<string, { enabled: boolean; times: string[] }>();
    for (const row of settingsRows || []) {
      if (!row.organization_id) continue;
      const cur = byOrg.get(row.organization_id) || { enabled: false, times: [] };
      if (row.setting_key === "followup_enabled") {
        cur.enabled = row.setting_value === true || row.setting_value === "true";
      } else if (row.setting_key === "followup_schedule_times") {
        const v = row.setting_value;
        if (Array.isArray(v)) cur.times = v as string[];
      }
      byOrg.set(row.organization_id, cur);
    }

    const triggered: string[] = [];

    for (const [orgId, cfg] of byOrg.entries()) {
      if (!cfg.enabled || !cfg.times.length) continue;

      // Match if any scheduled time falls within the last 5 minutes (inclusive of now)
      const match = cfg.times.some((t) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
        if (!m) return false;
        const h = Number(m[1]);
        const mn = Number(m[2]);
        const sched = h * 60 + mn;
        const diff = npMinutes - sched;
        return diff >= 0 && diff < 5;
      });

      if (!match) continue;

      // Fire process-followup async (do not await for full processing — just kick it off)
      fetch(`${supabaseUrl}/functions/v1/process-followup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ organization_id: orgId }),
      }).catch((e) => console.error(`trigger org=${orgId} failed`, e));

      triggered.push(orgId);
    }

    return new Response(JSON.stringify({ npNow, triggered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("followup-scheduler error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
