import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { action, pageId, accessToken, pageName, pagePictureUrl, userAccessToken } = await req.json();

    // Get user's organization_id
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (membershipError) {
      console.error("Failed to get user org membership:", membershipError);
    }

    const orgId = membership?.organization_id;
    if (!orgId) {
      console.error("No organization found for user:", user.id);
      return new Response(
        JSON.stringify({ error: "No organization found. Please contact support." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Helper function to get Facebook app credentials from DB
    async function getFacebookCredentials() {
      const { data: settingsData } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["facebook_app_id", "facebook_app_secret"]);

      let appId = "";
      let appSecret = "";

      settingsData?.forEach((s) => {
        if (s.setting_key === "facebook_app_id") {
          appId = typeof s.setting_value === "string" ? s.setting_value : "";
        }
        if (s.setting_key === "facebook_app_secret") {
          appSecret = typeof s.setting_value === "string" ? s.setting_value : "";
        }
      });

      return { appId, appSecret };
    }

    // Action: Exchange short-lived token for long-lived token
    if (action === "exchangeLongLivedToken") {
      const { appId, appSecret } = await getFacebookCredentials();

      if (!appId || !appSecret) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Facebook App credentials not configured. Please set up in Settings." 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!userAccessToken) {
        return new Response(
          JSON.stringify({ success: false, error: "User access token required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Exchange for long-lived token
      console.log("Exchanging token with App ID:", appId.substring(0, 5) + "...");
      const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userAccessToken}`;
      
      const exchangeResponse = await fetch(exchangeUrl);
      const exchangeData = await exchangeResponse.json();

      if (!exchangeResponse.ok || exchangeData.error) {
        console.error("Token exchange failed:", exchangeData);
        
        // Provide helpful error messages for common issues
        let errorMessage = exchangeData.error?.message || "Failed to exchange token";
        const errorCode = exchangeData.error?.code;
        
        if (errorMessage.includes("could not be decrypted") || errorCode === 190) {
          errorMessage = "App Secret doesn't match the App ID. Please verify your Facebook App credentials in Settings match exactly with Facebook Developer Console.";
        } else if (errorMessage.includes("Invalid OAuth access token")) {
          errorMessage = "Invalid token. Please try logging in with Facebook again.";
        } else if (errorCode === 101) {
          errorMessage = "Invalid App ID. Please check your Facebook App ID in Settings.";
        }
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: errorMessage,
            debug: { code: errorCode, original: exchangeData.error?.message }
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Calculate expiry (typically 60 days for long-lived tokens)
      const expiresIn = exchangeData.expires_in || 60 * 24 * 60 * 60; // Default 60 days in seconds
      const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

      return new Response(
        JSON.stringify({ 
          success: true, 
          access_token: exchangeData.access_token,
          token_expiry: tokenExpiry.toISOString(),
          expires_in: expiresIn
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "validate") {
      // Validate the token by calling Facebook Graph API
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}?fields=id,name,picture.type(square)&access_token=${accessToken}`
      );
      
      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error?.message || "Invalid token";
        
        // Provide more helpful error messages
        let userFriendlyError = errorMessage;
        if (errorMessage.includes("expired")) {
          userFriendlyError = "Token has expired. Please reconnect through Facebook Login.";
        } else if (errorMessage.includes("permission")) {
          userFriendlyError = "Token missing required permissions. Ensure pages_messaging is granted.";
        }
        
        return new Response(
          JSON.stringify({ success: false, error: userFriendlyError }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pageData = await response.json();
      return new Response(
        JSON.stringify({ 
          success: true, 
          page: {
            id: pageData.id,
            name: pageData.name,
            picture: pageData.picture?.data?.url
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "connect") {
      console.log("Connecting page:", pageId, "name:", pageName);
      
      // Validate token first
      const validateResponse = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}?fields=id,name,picture.type(square)&access_token=${accessToken}`
      );
      
      if (!validateResponse.ok) {
        const error = await validateResponse.json();
        console.error("Token validation failed:", error);
        
        let userFriendlyError = error.error?.message || "Invalid token";
        if (userFriendlyError.includes("expired")) {
          userFriendlyError = "Token has expired. Please reconnect through Facebook Login.";
        } else if (userFriendlyError.includes("permission")) {
          userFriendlyError = "Token missing required permissions. Ensure pages_messaging is granted.";
        }
        
        return new Response(
          JSON.stringify({ success: false, error: userFriendlyError }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pageData = await validateResponse.json();
      console.log("Token validated for page:", pageData.name);

      // Calculate token expiry (page tokens from long-lived user tokens are long-lived)
      // They typically don't expire but we set a reasonable expiry for health checks
      const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

      // Check if page already connected
      const { data: existingPage } = await supabase
        .from("connected_pages")
        .select("id")
        .eq("page_id", pageId)
        .maybeSingle();

      if (existingPage) {
        console.log("Updating existing page connection:", existingPage.id);
        // Update existing page
        const { error: updateError } = await supabase
          .from("connected_pages")
          .update({
            page_access_token: accessToken,
            page_name: pageData.name || pageName,
            page_picture_url: pageData.picture?.data?.url || pagePictureUrl,
            connection_status: "active",
            connected_by: user.id,
            organization_id: orgId,
            token_expiry: tokenExpiry.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPage.id);

        if (updateError) {
          console.error("Update error:", updateError);
          throw updateError;
        }

        // Re-subscribe to webhooks on reconnect
        try {
          console.log("Re-subscribing page to webhooks...");
          const subscribeResponse = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                subscribed_fields: "messages,messaging_postbacks,messaging_optins",
                access_token: accessToken,
              }),
            }
          );

          if (subscribeResponse.ok) {
            const subscribeData = await subscribeResponse.json();
            console.log("Webhook subscription result:", subscribeData);
          } else {
            const subscribeError = await subscribeResponse.json();
            console.warn("Webhook subscription failed (non-blocking):", subscribeError);
          }
        } catch (webhookError) {
          console.warn("Webhook subscription error (non-blocking):", webhookError);
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Page reconnected", 
            pageId: existingPage.id,
            token_expiry: tokenExpiry.toISOString()
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Creating new page connection");
      // Insert new page
      const { data: newPage, error: insertError } = await supabase
        .from("connected_pages")
        .insert({
          page_id: pageId,
          page_name: pageData.name || pageName,
          page_access_token: accessToken,
          page_picture_url: pageData.picture?.data?.url || pagePictureUrl,
          connected_by: user.id,
          connection_status: "active",
          token_expiry: tokenExpiry.toISOString(),
          organization_id: orgId,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }

      // Subscribe page to webhooks for real-time message updates
      try {
        console.log("Subscribing page to webhooks...");
        const subscribeResponse = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscribed_fields: "messages,messaging_postbacks,messaging_optins",
              access_token: accessToken,
            }),
          }
        );

        if (subscribeResponse.ok) {
          const subscribeData = await subscribeResponse.json();
          console.log("Webhook subscription result:", subscribeData);
        } else {
          const subscribeError = await subscribeResponse.json();
          console.warn("Webhook subscription failed (non-blocking):", subscribeError);
          // Don't fail the connection - webhook subscription is optional
        }
      } catch (webhookError) {
        console.warn("Webhook subscription error (non-blocking):", webhookError);
      }

      console.log("Page connected successfully:", newPage.id);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Page connected", 
          pageId: newPage.id,
          token_expiry: tokenExpiry.toISOString()
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "disconnect") {
      const { error: deleteError } = await supabase
        .from("connected_pages")
        .update({ connection_status: "disconnected" })
        .eq("page_id", pageId);

      if (deleteError) throw deleteError;

      return new Response(
        JSON.stringify({ success: true, message: "Page disconnected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Facebook connect error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
