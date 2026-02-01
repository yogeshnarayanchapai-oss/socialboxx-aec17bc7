import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Lead = Tables<"leads"> & {
  connected_pages?: { page_name: string };
};

export function useLeads(filters?: {
  status?: string;
  search?: string;
  pageId?: string;
}) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*, connected_pages:page_id(page_name)")
        .order("created_at", { ascending: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
      }
      if (filters?.pageId) {
        query = query.eq("page_id", filters.pageId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
  });
}

export function useLeadStats() {
  return useQuery({
    queryKey: ["lead-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("status");

      if (error) throw error;

      const stats = {
        total: data.length,
        new: data.filter(l => l.status === "new").length,
        hot: data.filter(l => l.status === "hot").length,
        follow_up: data.filter(l => l.status === "follow_up").length,
        closed: data.filter(l => l.status === "closed").length,
      };

      return stats;
    },
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (lead: TablesInsert<"leads">) => {
      const { data, error } = await supabase
        .from("leads")
        .insert(lead)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: TablesUpdate<"leads">;
    }) => {
      const { error } = await supabase
        .from("leads")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leads")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
    },
  });
}
