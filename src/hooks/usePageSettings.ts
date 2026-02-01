import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface AutoReplyKeyword {
  keywords: string[];
  reply: string;
}

export interface PageAutomationSettings {
  automation_enabled: boolean;
  auto_reply_first_message: string;
  auto_reply_followup: string;
  auto_reply_keywords: AutoReplyKeyword[];
}

export function useUpdatePageSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      settings,
    }: {
      pageId: string;
      settings: Partial<PageAutomationSettings>;
    }) => {
      // Cast auto_reply_keywords to Json for Supabase compatibility
      const updateData: Record<string, unknown> = { ...settings };
      if (settings.auto_reply_keywords) {
        updateData.auto_reply_keywords = settings.auto_reply_keywords as unknown as Json;
      }

      const { error } = await supabase
        .from("connected_pages")
        .update(updateData)
        .eq("id", pageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
    },
  });
}

export function useTogglePageAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      enabled,
    }: {
      pageId: string;
      enabled: boolean;
    }) => {
      const { error } = await supabase
        .from("connected_pages")
        .update({ automation_enabled: enabled })
        .eq("id", pageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
    },
  });
}
