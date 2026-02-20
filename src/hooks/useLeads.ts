import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useUserAccess } from "@/hooks/useUserAccess";

export type Lead = Tables<"leads"> & {
  connected_pages?: { page_name: string };
  source?: string;
  api_synced: boolean;
};

export function useLeads(filters?: {
  status?: string;
  search?: string;
  pageId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { accessiblePageIds, isLoading: isAccessLoading } = useUserAccess();

  return useQuery({
    queryKey: ["leads", filters, accessiblePageIds],
    queryFn: async () => {
      if (accessiblePageIds !== null && accessiblePageIds !== undefined && accessiblePageIds.length === 0) return [] as Lead[];

      let query = supabase
        .from("leads")
        .select("*, connected_pages:page_id(page_name)")
        .order("created_at", { ascending: false });

      // Filter by accessible pages for non-admins
      if (accessiblePageIds !== null && accessiblePageIds !== undefined && !filters?.pageId) {
        query = query.in("page_id", accessiblePageIds);
      }

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
      }
      if (filters?.pageId) {
        query = query.eq("page_id", filters.pageId);
      }
      if (filters?.dateFrom) {
        query = query.gte("created_at", filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte("created_at", filters.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
    enabled: !isAccessLoading && accessiblePageIds !== undefined,
  });
}

export function useLeadStats() {
  const { accessiblePageIds, isLoading: isAccessLoading } = useUserAccess();

  return useQuery({
    queryKey: ["lead-stats", accessiblePageIds],
    queryFn: async () => {
      if (accessiblePageIds !== null && accessiblePageIds !== undefined && accessiblePageIds.length === 0) {
        return { total: 0, new: 0, hot: 0, follow_up: 0, closed: 0 };
      }

      let query = supabase.from("leads").select("status, page_id");
      if (accessiblePageIds !== null && accessiblePageIds !== undefined) {
        query = query.in("page_id", accessiblePageIds);
      }

      const { data, error } = await query;
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
    enabled: !isAccessLoading && accessiblePageIds !== undefined,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (lead: TablesInsert<"leads">) => {
      // Get user's organization_id for RLS compliance
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: orgId } = await supabase.rpc("get_user_org_id", { _user_id: user.id });
      if (!orgId) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("leads")
        .insert({ ...lead, organization_id: orgId })
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
