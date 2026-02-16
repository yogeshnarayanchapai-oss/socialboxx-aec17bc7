import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TeamMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
  created_at: string;
  email?: string;
  full_name?: string;
  page_access: { page_id: string; access_level: string }[];
}

export function useTeamMembers(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["team-members", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      // Get org members
      const { data: members, error } = await supabase
        .from("organization_members")
        .select("id, user_id, organization_id, role, created_at")
        .eq("organization_id", organizationId);

      if (error) throw error;

      // Get profiles for these users
      const userIds = members?.map((m) => m.user_id) ?? [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);

      const profileMap = new Map(
        profiles?.map((p) => [p.user_id, p]) ?? []
      );

      // Get page access
      const { data: accessData } = await supabase
        .from("team_page_access")
        .select("user_id, page_id, access_level")
        .eq("organization_id", organizationId);

      const accessMap = new Map<string, { page_id: string; access_level: string }[]>();
      accessData?.forEach((a) => {
        const existing = accessMap.get(a.user_id) || [];
        existing.push({ page_id: a.page_id, access_level: a.access_level });
        accessMap.set(a.user_id, existing);
      });

      return (members ?? []).map((m) => ({
        ...m,
        email: profileMap.get(m.user_id)?.email ?? null,
        full_name: profileMap.get(m.user_id)?.full_name ?? null,
        page_access: accessMap.get(m.user_id) || [],
      })) as TeamMember[];
    },
    enabled: !!organizationId,
  });
}

export function useInviteTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      email,
      organizationId,
      role,
    }: {
      email: string;
      organizationId: string;
      role: string;
    }) => {
      // Find user by email in profiles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("email", email)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) throw new Error("No user found with this email. They must sign up first.");

      // Check if already a member
      const { data: existing } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", profile.user_id)
        .maybeSingle();

      if (existing) throw new Error("This user is already a team member.");

      // Get current user for invited_by
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("organization_members")
        .insert({
          organization_id: organizationId,
          user_id: profile.user_id,
          role: role as "admin" | "manager" | "agent",
          invited_by: user?.id,
        });

      if (error) throw error;

      return profile.user_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      // Remove page access first
      const { data: member } = await supabase
        .from("organization_members")
        .select("user_id, organization_id")
        .eq("id", memberId)
        .single();

      if (member) {
        await supabase
          .from("team_page_access")
          .delete()
          .eq("user_id", member.user_id)
          .eq("organization_id", member.organization_id);
      }

      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}

export function useUpdatePageAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      organizationId,
      pageId,
      accessLevel,
    }: {
      userId: string;
      organizationId: string;
      pageId: string;
      accessLevel: string | null; // null = remove access
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      if (accessLevel === null) {
        // Remove access
        const { error } = await supabase
          .from("team_page_access")
          .delete()
          .eq("user_id", userId)
          .eq("page_id", pageId);
        if (error) throw error;
      } else {
        // Upsert access
        const { error } = await supabase
          .from("team_page_access")
          .upsert(
            {
              user_id: userId,
              organization_id: organizationId,
              page_id: pageId,
              access_level: accessLevel,
              granted_by: user?.id,
            },
            { onConflict: "user_id,page_id" }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });
}
