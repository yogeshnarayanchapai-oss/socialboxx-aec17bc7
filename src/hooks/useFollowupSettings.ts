import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface FollowupSettings {
  enabled: boolean;
  schedule_times: string[]; // ["08:00", "21:00"] (Nepal Time)
}

const KEYS = ["followup_enabled", "followup_schedule_times"] as const;

async function getOrgId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export function useFollowupSettings() {
  return useQuery({
    queryKey: ["followup-settings"],
    queryFn: async (): Promise<FollowupSettings> => {
      const orgId = await getOrgId();
      const defaults: FollowupSettings = { enabled: false, schedule_times: [] };
      if (!orgId) return defaults;

      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", orgId)
        .in("setting_key", KEYS as unknown as string[]);

      if (error) throw error;

      const out = { ...defaults };
      for (const row of data || []) {
        if (row.setting_key === "followup_enabled") {
          out.enabled = row.setting_value === true || row.setting_value === "true";
        } else if (row.setting_key === "followup_schedule_times") {
          const v = row.setting_value;
          if (Array.isArray(v)) out.schedule_times = v.filter((x): x is string => typeof x === "string");
        }
      }
      return out;
    },
  });
}

export function useUpdateFollowupSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<FollowupSettings>) => {
      const orgId = await getOrgId();
      if (!orgId) throw new Error("No organization");
      const { data: { user } } = await supabase.auth.getUser();

      const rows: { setting_key: string; setting_value: Json }[] = [];
      if (updates.enabled !== undefined) {
        rows.push({ setting_key: "followup_enabled", setting_value: updates.enabled as unknown as Json });
      }
      if (updates.schedule_times !== undefined) {
        rows.push({ setting_key: "followup_schedule_times", setting_value: updates.schedule_times as unknown as Json });
      }

      for (const r of rows) {
        const { error } = await supabase
          .from("app_settings")
          .upsert(
            { ...r, organization_id: orgId, updated_by: user?.id, updated_at: new Date().toISOString() },
            { onConflict: "setting_key,organization_id" } as any,
          );
        // Fallback if no composite unique: try manual upsert
        if (error) {
          const { data: existing } = await supabase
            .from("app_settings")
            .select("id")
            .eq("organization_id", orgId)
            .eq("setting_key", r.setting_key)
            .maybeSingle();
          if (existing?.id) {
            const { error: e2 } = await supabase
              .from("app_settings")
              .update({ setting_value: r.setting_value, updated_by: user?.id, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
            if (e2) throw e2;
          } else {
            const { error: e3 } = await supabase
              .from("app_settings")
              .insert({ ...r, organization_id: orgId, updated_by: user?.id });
            if (e3) throw e3;
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followup-settings"] });
    },
  });
}

export async function triggerFollowupNow(): Promise<{ sent: number }> {
  const orgId = await getOrgId();
  if (!orgId) throw new Error("No organization");
  const { data, error } = await supabase.functions.invoke("process-followup", {
    body: { organization_id: orgId },
  });
  if (error) throw error;
  return { sent: data?.sent ?? 0 };
}
