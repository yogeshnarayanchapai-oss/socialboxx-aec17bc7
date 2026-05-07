import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface AppSettings {
  company_name?: string;
  timezone?: string;
  email_notifications?: boolean;
  business_hours_enabled?: boolean;
  business_hours_start?: string;
  business_hours_end?: string;
  working_days?: string[];
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  human_mode_enabled?: boolean;
  min_delay?: number;
  max_delay?: number;
  max_messages_per_conversation?: number;
  max_messages_per_page_hour?: number;
  min_gap_between_messages?: number;
  approve_before_send?: boolean;
  blacklist_keywords?: string[];
  do_not_contact?: string[];
  ai_lead_phone_rule?: string;
  ai_reply_language?: string;
}

const defaultSettings: AppSettings = {
  company_name: "",
  timezone: "utc-8",
  email_notifications: true,
  business_hours_enabled: true,
  business_hours_start: "09:00",
  business_hours_end: "18:00",
  working_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  human_mode_enabled: true,
  min_delay: 15,
  max_delay: 90,
  max_messages_per_conversation: 5,
  max_messages_per_page_hour: 30,
  min_gap_between_messages: 60,
  approve_before_send: true,
  blacklist_keywords: ["spam", "scam", "unsubscribe", "stop messaging"],
  do_not_contact: [],
  ai_lead_phone_rule: "Nepal 10-digit mobile starting with 97 or 98",
  ai_reply_language: "auto",
};

export function useSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value");

      if (error) throw error;

      const settings: AppSettings = { ...defaultSettings };
      
      data?.forEach((item) => {
        const key = item.setting_key as keyof AppSettings;
        if (key in settings) {
          (settings as Record<string, Json>)[key] = item.setting_value;
        }
      });

      return settings;
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<AppSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      for (const [key, value] of Object.entries(updates)) {
        const { error } = await supabase
          .from("app_settings")
          .upsert({
            setting_key: key,
            setting_value: value as Json,
            updated_by: user?.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: "setting_key" });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
  });
}
