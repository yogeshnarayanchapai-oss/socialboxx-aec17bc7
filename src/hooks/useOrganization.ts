import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useOrganization(userId: string | undefined) {
  return useQuery({
    queryKey: ["organization", userId],
    queryFn: async () => {
      if (!userId) return null;

      // Get user's org membership
      const { data: membership, error: memError } = await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", userId)
        .maybeSingle();

      if (memError) throw memError;
      if (!membership) return null;

      // Get org details
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", membership.organization_id)
        .single();

      if (orgError) throw orgError;

      return { ...org, userRole: membership.role };
    },
    enabled: !!userId,
  });
}

export function useIsPlatformAdmin(userId: string | undefined) {
  return useQuery({
    queryKey: ["platform-admin", userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data } = await supabase
        .from("platform_admins")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!userId,
  });
}

export function useAllOrganizations() {
  return useQuery({
    queryKey: ["all-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
