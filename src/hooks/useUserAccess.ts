import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";

export interface UserPageAccess {
  page_id: string;
  access_level: string;
}

export function useUserAccess() {
  const { user } = useAuth();
  const { data: org } = useOrganization(user?.id);

  const isAdmin = org?.userRole === "admin";

  const { data: pageAccess, isLoading } = useQuery({
    queryKey: ["user-page-access", user?.id, org?.id],
    queryFn: async () => {
      if (!user?.id || !org?.id) return [];

      // Admins have access to all pages
      if (isAdmin) return null; // null means "all pages"

      const { data, error } = await supabase
        .from("team_page_access")
        .select("page_id, access_level")
        .eq("user_id", user.id)
        .eq("organization_id", org.id);

      if (error) throw error;
      return data as UserPageAccess[];
    },
    enabled: !!user?.id && !!org?.id,
  });

  // Returns null for admins (all access), or array of page IDs
  const accessiblePageIds = isAdmin ? null : (pageAccess?.map(a => a.page_id) ?? []);
  const canEditPage = (pageId: string) => {
    if (isAdmin) return true;
    return pageAccess?.some(a => a.page_id === pageId && a.access_level === "edit") ?? false;
  };

  return {
    isAdmin,
    userRole: org?.userRole ?? "agent",
    accessiblePageIds, // null = all, [] = none, [...] = specific pages
    pageAccess,
    canEditPage,
    isLoading,
  };
}
