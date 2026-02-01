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

    const { action, pageId, accessToken, pageName } = await req.json();

    if (action === "validate") {
      // Validate the token by calling Facebook Graph API
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}?fields=id,name,picture&access_token=${accessToken}`
      );
      
      if (!response.ok) {
        const error = await response.json();
        return new Response(
          JSON.stringify({ success: false, error: error.error?.message || "Invalid token" }),
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
      // Validate token first
      const validateResponse = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}?fields=id,name,picture&access_token=${accessToken}`
      );
      
      if (!validateResponse.ok) {
        const error = await validateResponse.json();
        return new Response(
          JSON.stringify({ success: false, error: error.error?.message || "Invalid token" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pageData = await validateResponse.json();

      // Check if page already connected
      const { data: existingPage } = await supabase
        .from("connected_pages")
        .select("id")
        .eq("page_id", pageId)
        .single();

      if (existingPage) {
        // Update existing page
        const { error: updateError } = await supabase
          .from("connected_pages")
          .update({
            page_access_token: accessToken,
            page_name: pageData.name || pageName,
            page_picture_url: pageData.picture?.data?.url,
            connection_status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPage.id);

        if (updateError) throw updateError;
        
        return new Response(
          JSON.stringify({ success: true, message: "Page reconnected", pageId: existingPage.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert new page
      const { data: newPage, error: insertError } = await supabase
        .from("connected_pages")
        .insert({
          page_id: pageId,
          page_name: pageData.name || pageName,
          page_access_token: accessToken,
          page_picture_url: pageData.picture?.data?.url,
          connected_by: user.id,
          connection_status: "active",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return new Response(
        JSON.stringify({ success: true, message: "Page connected", pageId: newPage.id }),
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
