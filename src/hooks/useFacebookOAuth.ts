import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FacebookPage {
  id: string;
  name: string;
  accessToken: string;
  pictureUrl?: string;
  tasks?: string[];
}

export type WizardStep = "idle" | "connecting" | "loading_pages" | "select_pages" | "confirming" | "success" | "error";

interface FacebookOAuthState {
  step: WizardStep;
  pages: FacebookPage[];
  sessionId: string | null;
  error: string | null;
  selectedPageIds: Set<string>;
}

export function useFacebookOAuth() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FacebookOAuthState>({
    step: "idle",
    pages: [],
    sessionId: null,
    error: null,
    selectedPageIds: new Set(),
  });

  // Check URL params on mount for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fbSession = params.get("fb_session");
    const fbError = params.get("fb_error");
    const fbPagesCount = params.get("fb_pages_count");

    if (fbError) {
      setState((prev) => ({
        ...prev,
        step: "error",
        error: decodeURIComponent(fbError),
      }));
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      toast.error(`Facebook connection failed: ${decodeURIComponent(fbError)}`);
    } else if (fbSession) {
      // OAuth callback successful, fetch pages
      setState((prev) => ({
        ...prev,
        step: "loading_pages",
        sessionId: fbSession,
      }));
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Fetch pages from session
      fetchPagesFromSession(fbSession);
    }
  }, []);

  const fetchPagesFromSession = async (sessionId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-auth?action=pages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ sessionId }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch pages");
      }

      if (data.pages.length === 0) {
        setState((prev) => ({
          ...prev,
          step: "error",
          error: "No Facebook Pages found. Make sure you are an admin of at least one page.",
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        step: "select_pages",
        pages: data.pages,
        sessionId,
      }));
    } catch (error) {
      console.error("Failed to fetch pages:", error);
      setState((prev) => ({
        ...prev,
        step: "error",
        error: error instanceof Error ? error.message : "Failed to load pages",
      }));
      toast.error("Failed to load pages from Facebook");
    }
  };

  const startOAuth = useCallback(async () => {
    setState((prev) => ({ ...prev, step: "connecting", error: null }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please log in first");
      }

      // Get the OAuth URL from our backend
      const redirectUri = window.location.origin + window.location.pathname;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-auth?action=start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ redirectUri }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to start Facebook connection");
      }

      // Redirect to Facebook
      window.location.href = data.authUrl;
    } catch (error) {
      console.error("OAuth start error:", error);
      setState((prev) => ({
        ...prev,
        step: "error",
        error: error instanceof Error ? error.message : "Failed to start connection",
      }));
      toast.error(error instanceof Error ? error.message : "Failed to start Facebook connection");
    }
  }, []);

  const togglePageSelection = useCallback((pageId: string) => {
    setState((prev) => {
      const newSelected = new Set(prev.selectedPageIds);
      if (newSelected.has(pageId)) {
        newSelected.delete(pageId);
      } else {
        newSelected.add(pageId);
      }
      return { ...prev, selectedPageIds: newSelected };
    });
  }, []);

  const selectAllPages = useCallback(() => {
    setState((prev) => {
      const allSelected = prev.selectedPageIds.size === prev.pages.length;
      return {
        ...prev,
        selectedPageIds: allSelected ? new Set() : new Set(prev.pages.map((p) => p.id)),
      };
    });
  }, []);

  const connectPages = useMutation({
    mutationFn: async () => {
      if (state.selectedPageIds.size === 0) {
        throw new Error("Please select at least one page");
      }

      setState((prev) => ({ ...prev, step: "confirming" }));

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-auth?action=connect-page`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            sessionId: state.sessionId,
            pageIds: Array.from(state.selectedPageIds),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to connect pages");
      }

      return data;
    },
    onSuccess: (data) => {
      const connectedCount = data.results?.length || 0;
      const errorCount = data.errors?.length || 0;

      if (connectedCount > 0) {
        setState((prev) => ({ ...prev, step: "success" }));
        toast.success(`${connectedCount} page(s) connected successfully!`);
        queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
      }

      if (errorCount > 0) {
        toast.warning(`${errorCount} page(s) failed to connect`);
      }
    },
    onError: (error) => {
      setState((prev) => ({
        ...prev,
        step: "error",
        error: error instanceof Error ? error.message : "Connection failed",
      }));
      toast.error(error instanceof Error ? error.message : "Failed to connect pages");
    },
  });

  const reset = useCallback(() => {
    setState({
      step: "idle",
      pages: [],
      sessionId: null,
      error: null,
      selectedPageIds: new Set(),
    });
  }, []);

  const retryAfterError = useCallback(() => {
    setState((prev) => ({ ...prev, step: "idle", error: null }));
  }, []);

  return {
    // State
    step: state.step,
    pages: state.pages,
    error: state.error,
    selectedPageIds: state.selectedPageIds,
    isConnecting: connectPages.isPending,

    // Actions
    startOAuth,
    togglePageSelection,
    selectAllPages,
    connectPages: connectPages.mutate,
    reset,
    retryAfterError,
  };
}

// Hook for disconnecting pages
export function useDisconnectPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pageId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-auth?action=disconnect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ pageId }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to disconnect");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
      toast.success("Page disconnected");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect");
    },
  });
}

// Hook for checking connection status
export function useCheckConnectionStatus() {
  return useMutation({
    mutationFn: async (pageDbId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-auth?action=status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ pageDbId }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to check status");
      }

      return data;
    },
  });
}
