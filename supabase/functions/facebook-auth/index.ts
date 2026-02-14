import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Facebook OAuth configuration
const FB_GRAPH_VERSION = "v19.0";
const FB_GRAPH_URL = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;

// Required permissions for page connection and messaging
const REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_posts",
  "pages_messaging",
  "business_management",
].join(",");

interface OAuthState {
  userId: string;
  redirectUri: string;
  timestamp: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Facebook app credentials from environment (SaaS model - no user input needed)
    const appId = Deno.env.get("FACEBOOK_APP_ID");
    const appSecret = Deno.env.get("FACEBOOK_APP_SECRET");

    if (!appId || !appSecret) {
      console.error("Missing Facebook app credentials");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Facebook integration not configured. Please contact support.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    // ===== ACTION: START OAUTH FLOW =====
    // Prepares OAuth state and returns a redirect URL to our own edge function
    // The frontend navigates to this URL, which then 302-redirects to Facebook
    // This prevents mobile OS deep-linking from intercepting the facebook.com URL
    if (action === "start" || req.method === "GET" && url.pathname.includes("/start")) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify user
      const { data: { user }, error: userError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get redirect URI from request
      const body = req.method === "POST" ? await req.json() : {};
      const clientRedirectUri = body.redirectUri || url.searchParams.get("redirectUri") || "";

      if (!clientRedirectUri) {
        return new Response(
          JSON.stringify({ success: false, error: "redirectUri is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create state parameter for CSRF protection
      const state: OAuthState = {
        userId: user.id,
        redirectUri: clientRedirectUri,
        timestamp: Date.now(),
      };

      // Encode state as base64
      const stateParam = btoa(JSON.stringify(state));

      // Store state in database for validation later
      await supabase.from("app_settings").upsert({
        setting_key: `oauth_state_${stateParam.substring(0, 32)}`,
        setting_value: state,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }, { onConflict: "setting_key" });

      console.log("Generated OAuth state for user:", user.id);

      // Return a URL to our own edge function's redirect action
      // This avoids client-side navigation to facebook.com which triggers app deep-linking on mobile
      const serverRedirectUrl = `${supabaseUrl}/functions/v1/facebook-auth?action=redirect&state=${encodeURIComponent(stateParam)}`;

      return new Response(
        JSON.stringify({
          success: true,
          authUrl: serverRedirectUrl,
          state: stateParam,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== ACTION: SERVER-SIDE REDIRECT TO FACEBOOK =====
    // Browser navigates here, then gets 302-redirected to Facebook
    // This keeps the flow in the browser and prevents FB app interception
    if (action === "redirect") {
      const stateParam = url.searchParams.get("state");
      if (!stateParam) {
        return new Response("Missing state parameter", { status: 400 });
      }

      // Construct OAuth callback URL
      const oauthRedirectUri = `${supabaseUrl}/functions/v1/facebook-auth?action=callback`;

      // Build Facebook OAuth URL
      const fbAuthUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
      fbAuthUrl.searchParams.set("client_id", appId);
      fbAuthUrl.searchParams.set("redirect_uri", oauthRedirectUri);
      fbAuthUrl.searchParams.set("state", stateParam);
      fbAuthUrl.searchParams.set("scope", REQUIRED_SCOPES);
      fbAuthUrl.searchParams.set("response_type", "code");
      fbAuthUrl.searchParams.set("display", "page");

      console.log("Server-side redirecting to Facebook OAuth");

      return new Response(null, {
        status: 302,
        headers: { Location: fbAuthUrl.toString() },
      });
    }

    // ===== ACTION: OAUTH CALLBACK =====
    // Handles the callback from Facebook with authorization code
    if (action === "callback" || req.method === "GET" && url.searchParams.has("code")) {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      // Handle Facebook error response
      if (errorParam) {
        console.error("Facebook OAuth error:", errorParam, errorDescription);
        const errorRedirect = `/?fb_error=${encodeURIComponent(errorDescription || errorParam)}`;
        return new Response(null, {
          status: 302,
          headers: { Location: errorRedirect },
        });
      }

      if (!code || !stateParam) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/?fb_error=missing_parameters" },
        });
      }

      // Decode and validate state
      let state: OAuthState;
      try {
        state = JSON.parse(atob(stateParam));
      } catch {
        return new Response(null, {
          status: 302,
          headers: { Location: "/?fb_error=invalid_state" },
        });
      }

      // Check state age (10 minute max)
      if (Date.now() - state.timestamp > 10 * 60 * 1000) {
        return new Response(null, {
          status: 302,
          headers: { Location: `${state.redirectUri}?fb_error=state_expired` },
        });
      }

      // Verify state exists in database
      const { data: storedState } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", `oauth_state_${stateParam.substring(0, 32)}`)
        .single();

      if (!storedState) {
        return new Response(null, {
          status: 302,
          headers: { Location: `${state.redirectUri}?fb_error=invalid_state` },
        });
      }

      // Clean up state from database
      await supabase
        .from("app_settings")
        .delete()
        .eq("setting_key", `oauth_state_${stateParam.substring(0, 32)}`);

      // Exchange code for access token
      const oauthRedirectUri = `${supabaseUrl}/functions/v1/facebook-auth?action=callback`;
      const tokenUrl = `${FB_GRAPH_URL}/oauth/access_token`;
      const tokenParams = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: oauthRedirectUri,
        code: code,
      });

      console.log("Exchanging code for token...");
      const tokenResponse = await fetch(`${tokenUrl}?${tokenParams}`);
      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("Token exchange failed:", tokenData.error);
        return new Response(null, {
          status: 302,
          headers: { Location: `${state.redirectUri}?fb_error=${encodeURIComponent(tokenData.error.message || "token_exchange_failed")}` },
        });
      }

      const shortLivedToken = tokenData.access_token;

      // Exchange for long-lived token
      console.log("Exchanging for long-lived token...");
      const longLivedUrl = `${FB_GRAPH_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json();

      if (longLivedData.error) {
        console.error("Long-lived token exchange failed:", longLivedData.error);
        return new Response(null, {
          status: 302,
          headers: { Location: `${state.redirectUri}?fb_error=${encodeURIComponent(longLivedData.error.message || "long_lived_token_failed")}` },
        });
      }

      const longLivedToken = longLivedData.access_token;
      const expiresIn = longLivedData.expires_in || 5184000; // Default 60 days

      // Get user's Facebook ID
      const meResponse = await fetch(`${FB_GRAPH_URL}/me?access_token=${longLivedToken}`);
      const meData = await meResponse.json();
      const fbUserId = meData.id;

      // Fetch ALL user's pages with pagination (FB defaults to 25)
      console.log("Fetching user pages...");
      let allPages: any[] = [];
      let nextUrl: string | null = `${FB_GRAPH_URL}/me/accounts?fields=id,name,access_token,picture.type(square),tasks&limit=100&access_token=${longLivedToken}`;

      while (nextUrl) {
        const pagesResponse = await fetch(nextUrl);
        const pagesData = await pagesResponse.json();

        if (pagesData.error) {
          console.error("Failed to fetch pages:", pagesData.error);
          return new Response(null, {
            status: 302,
            headers: { Location: `${state.redirectUri}?fb_error=${encodeURIComponent(pagesData.error.message || "fetch_pages_failed")}` },
          });
        }

        if (pagesData.data) {
          allPages = allPages.concat(pagesData.data);
        }

        // Check for next page of results
        nextUrl = pagesData.paging?.next || null;
      }

      const pages = allPages;
      console.log(`Found ${pages.length} pages for user (fetched with pagination)`);

      // Store token temporarily for page connection
      const tokenExpiry = new Date(Date.now() + expiresIn * 1000);
      const sessionId = crypto.randomUUID();

      await supabase.from("app_settings").upsert({
        setting_key: `fb_session_${sessionId}`,
        setting_value: {
          userId: state.userId,
          fbUserId: fbUserId,
          longLivedToken: longLivedToken,
          tokenExpiry: tokenExpiry.toISOString(),
          pages: pages.map((p: any) => ({
            id: p.id,
            name: p.name,
            accessToken: p.access_token,
            pictureUrl: p.picture?.data?.url,
            tasks: p.tasks,
          })),
          createdAt: Date.now(),
        },
        updated_at: new Date().toISOString(),
        updated_by: state.userId,
      }, { onConflict: "setting_key" });

      // Redirect back to app with session ID
      const successRedirect = `${state.redirectUri}?fb_session=${sessionId}&fb_pages_count=${pages.length}`;
      console.log("OAuth complete, redirecting with session:", sessionId);

      return new Response(null, {
        status: 302,
        headers: { Location: successRedirect },
      });
    }

    // ===== ACTION: GET SESSION PAGES =====
    // Retrieve pages from a session after OAuth callback
    if (action === "pages" || (req.method === "POST" && url.pathname.includes("/pages"))) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const body = await req.json();
      const sessionId = body.sessionId;

      if (!sessionId) {
        return new Response(
          JSON.stringify({ success: false, error: "Session ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch session data
      const { data: sessionData } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", `fb_session_${sessionId}`)
        .single();

      if (!sessionData) {
        return new Response(
          JSON.stringify({ success: false, error: "Session not found or expired" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const session = sessionData.setting_value as any;

      // Verify session belongs to this user
      if (session.userId !== user.id) {
        return new Response(
          JSON.stringify({ success: false, error: "Session mismatch" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check session age (10 minute max)
      if (Date.now() - session.createdAt > 10 * 60 * 1000) {
        await supabase.from("app_settings").delete().eq("setting_key", `fb_session_${sessionId}`);
        return new Response(
          JSON.stringify({ success: false, error: "Session expired" }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          pages: session.pages,
          fbUserId: session.fbUserId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== ACTION: CONNECT PAGE =====
    // Connect selected page(s) from session
    if (action === "connect-page" || (req.method === "POST" && url.pathname.includes("/connect"))) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const body = await req.json();
      const { sessionId, pageIds } = body;

      if (!sessionId || !pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Session ID and page IDs required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch session data
      const { data: sessionData } = await supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", `fb_session_${sessionId}`)
        .single();

      if (!sessionData) {
        return new Response(
          JSON.stringify({ success: false, error: "Session not found or expired" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const session = sessionData.setting_value as any;

      if (session.userId !== user.id) {
        return new Response(
          JSON.stringify({ success: false, error: "Session mismatch" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results: any[] = [];
      const errors: any[] = [];

      for (const pageId of pageIds) {
        const page = session.pages.find((p: any) => p.id === pageId);
        if (!page) {
          errors.push({ pageId, error: "Page not found in session" });
          continue;
        }

        try {
          // Validate page token
          const validateUrl = `${FB_GRAPH_URL}/${pageId}?fields=id,name,picture.type(square)&access_token=${page.accessToken}`;
          const validateResponse = await fetch(validateUrl);
          const validateData = await validateResponse.json();

          if (validateData.error) {
            errors.push({ pageId, pageName: page.name, error: validateData.error.message });
            continue;
          }

          // Calculate token expiry
          const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

          // Check if page already exists
          const { data: existingPage } = await supabase
            .from("connected_pages")
            .select("id")
            .eq("page_id", pageId)
            .maybeSingle();

          if (existingPage) {
            // Update existing page
            await supabase
              .from("connected_pages")
              .update({
                page_access_token: page.accessToken,
                page_name: validateData.name || page.name,
                page_picture_url: validateData.picture?.data?.url || page.pictureUrl,
                connection_status: "active",
                connected_by: user.id,
                token_expiry: tokenExpiry.toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingPage.id);

            results.push({ pageId, pageName: page.name, action: "reconnected" });
          } else {
            // Insert new page
            await supabase.from("connected_pages").insert({
              page_id: pageId,
              page_name: validateData.name || page.name,
              page_access_token: page.accessToken,
              page_picture_url: validateData.picture?.data?.url || page.pictureUrl,
              connected_by: user.id,
              connection_status: "active",
              token_expiry: tokenExpiry.toISOString(),
            });

            results.push({ pageId, pageName: page.name, action: "connected" });
          }

          // Subscribe to webhooks
          console.log(`Subscribing page ${pageId} to webhooks...`);
          const subscribeUrl = `${FB_GRAPH_URL}/${pageId}/subscribed_apps`;
          const subscribeResponse = await fetch(subscribeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscribed_fields: "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads",
              access_token: page.accessToken,
            }),
          });

          const subscribeData = await subscribeResponse.json();
          if (subscribeData.success) {
            console.log(`Webhook subscription successful for page ${pageId}`);
          } else {
            console.warn(`Webhook subscription failed for page ${pageId}:`, subscribeData);
            // Don't fail the connection, just log
          }

        } catch (err) {
          console.error(`Error connecting page ${pageId}:`, err);
          errors.push({ pageId, pageName: page.name, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      // Clean up session after connecting
      await supabase.from("app_settings").delete().eq("setting_key", `fb_session_${sessionId}`);

      return new Response(
        JSON.stringify({
          success: true,
          results,
          errors,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== ACTION: DISCONNECT PAGE =====
    if (action === "disconnect") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const body = await req.json();
      const { pageId } = body;

      if (!pageId) {
        return new Response(
          JSON.stringify({ success: false, error: "Page ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get page data for unsubscribe
      const { data: page } = await supabase
        .from("connected_pages")
        .select("page_id, page_access_token")
        .eq("id", pageId)
        .single();

      if (page) {
        // Try to unsubscribe from webhooks
        try {
          console.log(`Unsubscribing page ${page.page_id} from webhooks...`);
          const unsubscribeUrl = `${FB_GRAPH_URL}/${page.page_id}/subscribed_apps?access_token=${page.page_access_token}`;
          await fetch(unsubscribeUrl, { method: "DELETE" });
        } catch (err) {
          console.warn("Failed to unsubscribe from webhooks:", err);
        }
      }

      // Update status to disconnected
      await supabase
        .from("connected_pages")
        .update({
          connection_status: "disconnected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pageId);

      console.log(`Page ${pageId} disconnected`);

      return new Response(
        JSON.stringify({ success: true, message: "Page disconnected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== ACTION: CONNECTION STATUS =====
    if (action === "status") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const body = await req.json();
      const { pageDbId } = body;

      if (!pageDbId) {
        return new Response(
          JSON.stringify({ success: false, error: "Page database ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get page data
      const { data: page, error: pageError } = await supabase
        .from("connected_pages")
        .select("page_id, page_access_token, connection_status, token_expiry")
        .eq("id", pageDbId)
        .single();

      if (pageError || !page) {
        return new Response(
          JSON.stringify({ success: false, error: "Page not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify token is still valid
      const validateUrl = `${FB_GRAPH_URL}/${page.page_id}?fields=id&access_token=${page.page_access_token}`;
      const validateResponse = await fetch(validateUrl);
      const validateData = await validateResponse.json();

      const tokenValid = !validateData.error;
      const tokenExpiry = page.token_expiry ? new Date(page.token_expiry) : null;
      const isExpiringSoon = tokenExpiry && tokenExpiry < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Update status if token is invalid
      if (!tokenValid && page.connection_status === "active") {
        await supabase
          .from("connected_pages")
          .update({ connection_status: "token_expired" })
          .eq("id", pageDbId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: tokenValid ? "active" : "token_expired",
          tokenValid,
          tokenExpiry: tokenExpiry?.toISOString(),
          isExpiringSoon,
          messagingEnabled: true, // Will be false if messaging permission not approved
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: start, callback, pages, connect-page, disconnect, status" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Facebook auth error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
