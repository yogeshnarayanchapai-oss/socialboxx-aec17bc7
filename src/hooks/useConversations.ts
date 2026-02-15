import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEffect } from "react";

export type Conversation = Tables<"conversations"> & {
  connected_pages?: { page_name: string };
};
export type Message = Tables<"messages">;

export function useConversations(filters?: {
  pageId?: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ["conversations", filters],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select("*, connected_pages(page_name)")
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false });

      if (filters?.pageId) {
        query = query.eq("page_id", filters.pageId);
      }
      if (filters?.status && filters.status !== "all") {
        if (filters.status === "lead") {
          query = query.contains("tags", ["lead-created"]);
        } else if (filters.status === "follow-up") {
          // Follow-up conversations have followup step >= 1 (either AI or automation)
          query = query.or("auto_followup_step.gte.1,ai_followup_step.gte.1");
        } else {
          query = query.eq("status", filters.status);
        }
      }
      if (filters?.search) {
        query = query.ilike("participant_name", `%${filters.search}%`);
      }
      if (filters?.dateFrom) {
        query = query.gte("last_message_at", filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte("last_message_at", filters.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Conversation[];
    },
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, pageId, recipientId, message, mediaUrl }: {
      conversationId: string; pageId: string; recipientId: string; message: string; mediaUrl?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: "send_message", pageId, conversationId, recipientId, message, mediaUrl }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to send message");
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["messages", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useFetchConversations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pageId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: "fetch_conversations", pageId }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to fetch conversations");
      return result;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["conversations"] }); },
  });
}

export function useRealtimeConversations() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("conversations-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages"] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["messages"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);
}

export function useAISuggestion() {
  return useMutation({
    mutationFn: async ({ conversationId, customerMessage, conversationHistory, pageName }: {
      conversationId: string; customerMessage: string; conversationHistory?: string; pageName?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ conversationId, customerMessage, conversationHistory, pageName }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to get AI suggestion");
      return result;
    },
  });
}

export function useAddInternalNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("messages")
        .insert({ conversation_id: conversationId, content, sender_type: "page", is_internal_note: true, sent_by: user.id })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["messages", variables.conversationId] });
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, updates }: { conversationId: string; updates: Partial<Tables<"conversations">> }) => {
      const { error } = await supabase.from("conversations").update(updates).eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["conversations"] }); },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from("conversations")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
