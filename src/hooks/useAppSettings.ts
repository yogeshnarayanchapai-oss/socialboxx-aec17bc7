import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface FacebookSettings {
  facebook_app_id: string;
  facebook_app_secret: string;
  facebook_webhook_verify_token: string;
}

const FB_SETTING_KEYS = [
  "facebook_app_id",
  "facebook_app_secret",
  "facebook_webhook_verify_token",
] as const;

export function useFacebookSettings() {
  return useQuery({
    queryKey: ["facebook-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", FB_SETTING_KEYS);

      if (error) throw error;

      const settings: FacebookSettings = {
        facebook_app_id: "",
        facebook_app_secret: "",
        facebook_webhook_verify_token: "socialbox_verify_token",
      };

      data?.forEach((item) => {
        const key = item.setting_key as keyof FacebookSettings;
        if (key in settings) {
          // setting_value is JSON, could be a string wrapped in quotes
          const value = item.setting_value;
          if (typeof value === "string") {
            settings[key] = value;
          } else if (value !== null) {
            settings[key] = String(value);
          }
        }
      });

      return settings;
    },
  });
}

export function useUpdateFacebookSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<FacebookSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();

      for (const [key, value] of Object.entries(updates)) {
        const { error } = await supabase
          .from("app_settings")
          .upsert(
            {
              setting_key: key,
              setting_value: value as Json,
              updated_by: user?.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "setting_key" }
          );

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facebook-settings"] });
    },
  });
}

// Fetch only App ID for SDK initialization (public, no auth required for read)
export async function fetchFacebookAppId(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "facebook_app_id")
      .maybeSingle();

    if (error || !data) return null;

    const value = data.setting_value;
    if (typeof value === "string" && value.trim() && value !== '""') {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}
