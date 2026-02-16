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

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization header required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = membership.organization_id;

    if (req.method === "GET") {
      // Fetch leads
      const url = new URL(req.url);
      const status = url.searchParams.get("status");
      const pageId = url.searchParams.get("page_id");
      const pageIds = url.searchParams.get("page_ids"); // comma-separated
      const limit = parseInt(url.searchParams.get("limit") || "100");

      let query = supabase
        .from("leads")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 500));

      if (status) query = query.eq("status", status);
      
      // Support multiple page_ids (comma-separated) or single page_id
      if (pageIds) {
        const ids = pageIds.split(",").map(id => id.trim()).filter(Boolean);
        if (ids.length > 0) query = query.in("page_id", ids);
      } else if (pageId) {
        query = query.eq("page_id", pageId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, leads: data, count: data?.length || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      // Create lead
      const body = await req.json();
      const { full_name, phone, product, source, status, notes, page_id } = body;

      if (!full_name && !phone) {
        return new Response(JSON.stringify({ error: "full_name or phone is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("leads")
        .insert({
          full_name: full_name || null,
          phone: phone || null,
          product: product || null,
          source: source || "API",
          status: status || "new",
          notes: notes || null,
          page_id: page_id || null,
          organization_id: orgId,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, lead: data }), {
        status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Leads API error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
