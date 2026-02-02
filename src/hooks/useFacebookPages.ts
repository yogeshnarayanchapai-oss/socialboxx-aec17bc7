import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchFacebookAppId } from "./useAppSettings";

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  picture?: {
    data?: {
      url: string;
    };
  };
  tasks?: string[];
}

interface FacebookLoginState {
  pages: FacebookPage[];
  isLoading: boolean;
  showPageSelection: boolean;
  error: string | null;
}

const LOGIN_TIMEOUT_MS = 60000; // 60 second timeout

export function useFacebookLogin() {
  const [state, setState] = useState<FacebookLoginState>({
    pages: [],
    isLoading: false,
    showPageSelection: false,
    error: null,
  });

  const timeoutRef = useRef<number | null>(null);

  const clearTimeout = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const setLoading = (isLoading: boolean) => {
    if (!isLoading) {
      clearTimeout();
    }
    setState((prev) => ({ ...prev, isLoading }));
  };

  const setError = (error: string | null) => {
    setState((prev) => ({ ...prev, error, isLoading: false }));
    clearTimeout();
    if (error) {
      toast.error(error);
    }
  };

  const initiateLogin = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    // Set timeout protection
    timeoutRef.current = window.setTimeout(() => {
      setError("Facebook login timed out. Please try again.");
    }, LOGIN_TIMEOUT_MS);

    try {
      // Check if FB SDK is available
      if (!window.FB) {
        await loadFacebookSDK();
      }

      if (!window.FB) {
        throw new Error("Failed to load Facebook SDK. Please refresh and try again.");
      }

      window.FB.login(
        (response: any) => {
          if (response.authResponse) {
            fetchUserPages(response.authResponse.accessToken);
          } else {
            if (response.status === "unknown") {
              setError("Facebook login was cancelled or popup was blocked.");
            } else {
              setError("Facebook login failed. Please try again.");
            }
          }
        },
        {
          scope: "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging",
          return_scopes: true,
        }
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to start Facebook login");
    }
  }, []);

  const fetchUserPages = async (userAccessToken: string) => {
    try {
      // First, exchange for long-lived token via our edge function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated. Please log in first.");
      }

      console.log("Exchanging for long-lived token...");
      const exchangeResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-connect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: "exchangeLongLivedToken",
            userAccessToken: userAccessToken,
          }),
        }
      );

      const exchangeData = await exchangeResponse.json();
      
      // Use long-lived token if exchange succeeded, otherwise fall back to original
      let tokenToUse = userAccessToken;
      if (exchangeResponse.ok && exchangeData.access_token) {
        console.log("Got long-lived token, expires:", exchangeData.token_expiry);
        tokenToUse = exchangeData.access_token;
      } else {
        console.warn("Token exchange failed, using short-lived token:", exchangeData.error);
        // Don't fail - try with short-lived token (might work for immediate use)
      }

      // Now fetch pages using the (preferably long-lived) token
      const response = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,picture.type(square),tasks&access_token=${tokenToUse}`
      );
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || "Failed to fetch pages from Facebook");
      }

      if (!data.data || data.data.length === 0) {
        setError("No Facebook Pages found for this account. Make sure you are an admin of at least one page.");
        return;
      }

      clearTimeout();
      setState((prev) => ({
        ...prev,
        pages: data.data,
        showPageSelection: true,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to fetch pages");
    }
  };

  const reset = useCallback(() => {
    clearTimeout();
    setState({
      pages: [],
      isLoading: false,
      showPageSelection: false,
      error: null,
    });
  }, []);

  const setShowPageSelection = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showPageSelection: show }));
  }, []);

  return {
    pages: state.pages,
    isLoading: state.isLoading,
    showPageSelection: state.showPageSelection,
    error: state.error,
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
      const errors = [];

      for (const page of selectedPages) {
        try {
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
                pagePictureUrl: page.picture?.data?.url,
              }),
            }
          );

          const result = await response.json();
          if (!response.ok) {
            errors.push({ page: page.name, error: result.error || "Failed to connect" });
          } else {
            results.push(result);
          }
        } catch (error) {
          errors.push({
            page: page.name,
            error: error instanceof Error ? error.message : "Connection failed",
          });
        }
      }

      if (errors.length > 0 && results.length === 0) {
        throw new Error(`Failed to connect pages: ${errors.map(e => e.page).join(", ")}`);
      }

      return { results, errors };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
      if (data.errors.length > 0) {
        toast.warning(`Connected ${data.results.length} page(s), but ${data.errors.length} failed`);
      }
    },
  });
}

// Helper to load Facebook SDK with runtime App ID from DB
async function loadFacebookSDK(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }

    // Try to get App ID from database first, then fallback to env
    let appId = await fetchFacebookAppId();
    
    if (!appId) {
      // Fallback to environment variable
      appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    }

    if (!appId || appId === "YOUR_APP_ID") {
      reject(new Error("Facebook App ID not configured. Please set up in Settings → Facebook Integration."));
      return;
    }

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: appId,
        cookie: true,
        xfbml: true,
        version: "v19.0",
      });
      resolve();
    };

    // Check if script already exists
    if (document.getElementById("facebook-jssdk")) {
      // SDK loading in progress, wait a bit
      setTimeout(() => {
        if (window.FB) {
          resolve();
        } else {
          reject(new Error("Facebook SDK failed to initialize"));
        }
      }, 2000);
      return;
    }

    // Load the SDK asynchronously
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Failed to load Facebook SDK"));
    document.body.appendChild(script);

    // Timeout fallback
    setTimeout(() => {
      if (!window.FB) {
        reject(new Error("Facebook SDK load timeout"));
      }
    }, 10000);
  });
}

// Extend Window interface for Facebook SDK
declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}
