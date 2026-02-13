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
      extraData,
    }: {
      pageId: string;
      settings: Partial<PageAutomationSettings>;
      extraData?: {
        auto_reply_messages?: any[];
        auto_followup_messages?: any[];
      };
    }) => {
      const updateData: Record<string, any> = {};

      if (settings.automation_enabled !== undefined) {
        updateData.automation_enabled = settings.automation_enabled;
      }
      if (settings.auto_reply_first_message !== undefined) {
        updateData.auto_reply_first_message = settings.auto_reply_first_message;
      }
      if (settings.auto_reply_followup !== undefined) {
        updateData.auto_reply_followup = settings.auto_reply_followup;
      }
      if (settings.auto_reply_keywords !== undefined) {
        updateData.auto_reply_keywords = settings.auto_reply_keywords as unknown as Json;
      }
      // Multi-step messages
      if (extraData?.auto_reply_messages) {
        updateData.auto_reply_messages = extraData.auto_reply_messages as unknown as Json;
      }
      if (extraData?.auto_followup_messages) {
        updateData.auto_followup_messages = extraData.auto_followup_messages as unknown as Json;
      }

      console.log("Updating page settings:", { pageId, updateData });

      const { data, error } = await supabase
        .from("connected_pages")
        .update(updateData)
        .eq("id", pageId)
        .select();

      if (error) {
        console.error("Update error:", error);
        throw error;
      }

      console.log("Update success:", data);
      return data;
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
