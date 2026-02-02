import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Facebook app credentials from settings
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

    // Get all connected pages with token_expiry
    const { data: pages, error: pagesError } = await supabase
      .from("connected_pages")
      .select("id, page_id, page_name, page_access_token, token_expiry, connection_status")
      .eq("connection_status", "active");

    if (pagesError) throw pagesError;

    const results = {
      checked: 0,
      healthy: 0,
      expiring_soon: 0,
      expired: 0,
      refreshed: 0,
      refresh_failed: 0,
      details: [] as any[],
    };

    const now = new Date();
    const warningThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    for (const page of pages || []) {
      results.checked++;

      const tokenExpiry = page.token_expiry ? new Date(page.token_expiry) : null;
      const pageResult = {
        page_id: page.page_id,
        page_name: page.page_name,
        status: "healthy" as string,
        token_expiry: page.token_expiry,
        action: "none" as string,
      };

      // Check if token is expired
      if (tokenExpiry && tokenExpiry < now) {
        pageResult.status = "expired";
        results.expired++;

        // Update status in DB
        await supabase
          .from("connected_pages")
          .update({ connection_status: "token_expired" })
          .eq("id", page.id);

        pageResult.action = "marked_expired";
      }
      // Check if token is expiring soon (within 7 days)
      else if (tokenExpiry && tokenExpiry < warningThreshold) {
        pageResult.status = "expiring_soon";
        results.expiring_soon++;

        // Try to refresh if we have app credentials
        if (appId && appSecret) {
          try {
            // Try to refresh the token
            const refreshUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${page.page_access_token}`;

            const refreshResponse = await fetch(refreshUrl);

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();

              if (refreshData.access_token) {
                // Calculate new expiry (60 days from now)
                const newExpiry = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

                // Update the token in DB
                await supabase
                  .from("connected_pages")
                  .update({
                    page_access_token: refreshData.access_token,
                    token_expiry: newExpiry.toISOString(),
                    updated_at: now.toISOString(),
                  })
                  .eq("id", page.id);

                pageResult.action = "refreshed";
                pageResult.token_expiry = newExpiry.toISOString();
                results.refreshed++;
              }
            } else {
              console.warn(`Failed to refresh token for page ${page.page_name}`);
              pageResult.action = "refresh_failed";
              results.refresh_failed++;
            }
          } catch (refreshError) {
            console.error(`Token refresh error for ${page.page_name}:`, refreshError);
            pageResult.action = "refresh_error";
            results.refresh_failed++;
          }
        } else {
          pageResult.action = "no_credentials";
        }
      }
      // Token is healthy
      else if (!tokenExpiry) {
        pageResult.status = "unknown_expiry";
        results.healthy++;
      } else {
        results.healthy++;
      }

      results.details.push(pageResult);
    }

    console.log("Token health check results:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Token health check error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
