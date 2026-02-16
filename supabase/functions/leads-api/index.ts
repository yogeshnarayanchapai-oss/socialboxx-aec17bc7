import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let orgId: string;
    let allowedPageIds: string[] = []; // Combined key can have multiple pages

    // Check for X-API-Key header first, then fallback to Bearer token as API key
    let apiKey = req.headers.get("X-API-Key") || req.headers.get("x-api-key");
    
    // Also support Authorization: Bearer <api_key> for third-party compatibility
    if (!apiKey) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        // Check if this token is an API key (not a JWT - JWTs have 3 dot-separated parts)
        if (token.split(".").length !== 3) {
          apiKey = token;
        }
      }
    }
    
    if (apiKey) {
      const { data: integration, error: intError } = await supabase
        .from("api_integrations")
        .select("id, organization_id, is_active")
        .eq("api_key", apiKey)
        .single();

      if (intError || !integration) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!integration.is_active) {
        return new Response(JSON.stringify({ error: "API key is disabled" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      orgId = integration.organization_id;

      // Get all pages linked to this key from junction table
      const { data: linkedPages } = await supabase
        .from("api_integration_pages")
        .select("page_id")
        .eq("integration_id", integration.id);

      allowedPageIds = (linkedPages || []).map(p => p.page_id);

      if (allowedPageIds.length === 0) {
        return new Response(JSON.stringify({ error: "No pages linked to this API key" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Fallback: JWT Bearer token auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Authorization header or X-API-Key required" }), {
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

      orgId = membership.organization_id;
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const status = url.searchParams.get("status");
      const pageId = url.searchParams.get("page_id");
      const limit = parseInt(url.searchParams.get("limit") || "100");

      let query = supabase
        .from("leads")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 500));

      if (status) query = query.eq("status", status);

      // If API key auth, restrict to allowed pages
      if (allowedPageIds.length > 0) {
        query = query.in("page_id", allowedPageIds);
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
      const body = await req.json();
      const { full_name, phone, product, source, status, notes, page_id } = body;

      if (!full_name && !phone) {
        return new Response(JSON.stringify({ error: "full_name or phone is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let finalPageId: string;

      if (allowedPageIds.length > 0) {
        // API key auth: use provided page_id if it's in allowed list, else use first allowed
        if (page_id && allowedPageIds.includes(page_id)) {
          finalPageId = page_id;
        } else if (allowedPageIds.length === 1) {
          finalPageId = allowedPageIds[0];
        } else if (page_id) {
          return new Response(JSON.stringify({ 
            error: "page_id not allowed for this API key",
            allowed_pages: allowedPageIds 
          }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          // Default to first page if only key has multiple pages and no page_id given
          finalPageId = allowedPageIds[0];
        }
      } else if (page_id) {
        // JWT auth: validate page_id belongs to org
        const { data: page } = await supabase
          .from("connected_pages")
          .select("id")
          .eq("id", page_id)
          .eq("organization_id", orgId)
          .single();

        if (!page) {
          return new Response(JSON.stringify({ error: "Invalid page_id" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        finalPageId = page_id;
      } else {
        return new Response(JSON.stringify({ error: "page_id is required" }), {
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
          page_id: finalPageId,
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
