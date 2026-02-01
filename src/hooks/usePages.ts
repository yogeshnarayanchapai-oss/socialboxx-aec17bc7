import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ConnectedPage = Tables<"connected_pages">;

export function useConnectedPages() {
  return useQuery({
    queryKey: ["connected-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connected_pages")
        .select("*")
        .eq("connection_status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ConnectedPage[];
    },
  });
}

export function useConnectPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      accessToken,
      pageName,
    }: {
      pageId: string;
      accessToken: string;
      pageName?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-connect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "connect",
            pageId,
            accessToken,
            pageName,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to connect page");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
    },
  });
}

export function useValidatePageToken() {
  return useMutation({
    mutationFn: async ({
      pageId,
      accessToken,
    }: {
      pageId: string;
      accessToken: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-connect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "validate",
            pageId,
            accessToken,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invalid token");
      return result;
    },
  });
}

export function useDisconnectPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pageId: string) => {
      const { error } = await supabase
        .from("connected_pages")
        .update({ connection_status: "disconnected" })
        .eq("id", pageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
    },
  });
}
