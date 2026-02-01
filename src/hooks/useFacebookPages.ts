import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  picture?: {
    data?: {
      url: string;
    };
  };
}

export function useFacebookLogin() {
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPageSelection, setShowPageSelection] = useState(false);

  const initiateLogin = async () => {
    // Check if FB SDK is available
    if (!window.FB) {
      // Load FB SDK dynamically
      await loadFacebookSDK();
    }

    setIsLoading(true);

    window.FB.login(
      (response: any) => {
        if (response.authResponse) {
          fetchUserPages(response.authResponse.accessToken);
        } else {
          setIsLoading(false);
          toast.error("Facebook login cancelled or failed");
        }
      },
      {
        scope: "pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata",
      }
    );
  };

  const fetchUserPages = async (userAccessToken: string) => {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,picture.type(square)&access_token=${userAccessToken}`
      );
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      if (!data.data || data.data.length === 0) {
        toast.error("No Facebook Pages found for this account");
        setIsLoading(false);
        return;
      }

      setPages(data.data);
      setShowPageSelection(true);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      toast.error(error instanceof Error ? error.message : "Failed to fetch pages");
    }
  };

  const reset = () => {
    setPages([]);
    setShowPageSelection(false);
    setIsLoading(false);
  };

  return {
    pages,
    isLoading,
    showPageSelection,
    initiateLogin,
    reset,
    setShowPageSelection,
  };
}

export function useConnectMultiplePages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (selectedPages: FacebookPage[]) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const results = [];

      for (const page of selectedPages) {
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
              pageId: page.id,
              accessToken: page.access_token,
              pageName: page.name,
            }),
          }
        );

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || `Failed to connect page: ${page.name}`);
        }
        results.push(result);
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
    },
  });
}

// Helper to load Facebook SDK
function loadFacebookSDK(): Promise<void> {
  return new Promise((resolve) => {
    if (window.FB) {
      resolve();
      return;
    }

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: import.meta.env.VITE_FACEBOOK_APP_ID || "YOUR_APP_ID",
        cookie: true,
        xfbml: true,
        version: "v19.0",
      });
      resolve();
    };

    // Load the SDK asynchronously
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    // Fallback resolve if SDK doesn't load
    setTimeout(() => resolve(), 3000);
  });
}

// Extend Window interface for Facebook SDK
declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}
