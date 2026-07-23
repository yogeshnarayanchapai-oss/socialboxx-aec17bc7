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
    let allowedPageIds: string[] = [];

    // Check for X-API-Key header first, then fallback to Bearer token as API key
    let apiKey = req.headers.get("X-API-Key") || req.headers.get("x-api-key");
    
    // Also support Authorization: Bearer <api_key> for third-party compatibility
    if (!apiKey) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        if (token.split(".").length !== 3) {
          apiKey = token;
        }
      }
    }
    
    if (apiKey) {
      const { data: integration, error: intError } = await supabase
        .from("api_integrations")
        .select("id, organization_id, is_active, scope_type, group_id")
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

      // Resolve pages based on scope_type
      if (integration.scope_type === "group" && integration.group_id) {
        // Group scope: include all pages in this group (regardless of connection status,
        // so leads from temporarily-disconnected pages are still pulled)
        const { data: groupPages } = await supabase
          .from("connected_pages")
          .select("id")
          .eq("group_id", integration.group_id)
          .eq("organization_id", orgId);

        allowedPageIds = (groupPages || []).map(p => p.id);
      } else if (integration.scope_type === "ungrouped") {
        // Ungrouped scope: include all pages NOT in any group (regardless of connection status)
        const { data: ungroupedPages } = await supabase
          .from("connected_pages")
          .select("id")
          .is("group_id", null)
          .eq("organization_id", orgId);

        allowedPageIds = (ungroupedPages || []).map(p => p.id);
      } else {
        // Custom scope: use junction table (legacy behavior)
        const { data: linkedPages } = await supabase
          .from("api_integration_pages")
          .select("page_id")
          .eq("integration_id", integration.id);

        allowedPageIds = (linkedPages || []).map(p => p.page_id);
      }

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
      const limit = parseInt(url.searchParams.get("limit") || "500");

      let query = supabase
        .from("leads")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 1000));

      if (status) query = query.eq("status", status);

      // If API key auth, restrict to allowed pages
      if (allowedPageIds.length > 0) {
        query = query.in("page_id", allowedPageIds);
      } else if (pageId) {
        query = query.eq("page_id", pageId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Mark fetched leads as api_synced and set status to "pulled"
      if (data && data.length > 0) {
        const unsyncedIds = data.filter((l: any) => !l.api_synced).map((l: any) => l.id);
        if (unsyncedIds.length > 0) {
          await supabase.from("leads").update({ api_synced: true, status: "pulled" }).in("id", unsyncedIds);
        }
      }

      return new Response(JSON.stringify({ success: true, leads: data, count: data?.length || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { full_name, phone, product, source, status, notes, page_id } = body;

      if (!phone || !String(phone).trim()) {
        return new Response(JSON.stringify({ error: "phone is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }


      let finalPageId: string;

      if (allowedPageIds.length > 0) {
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
          finalPageId = allowedPageIds[0];
        }
      } else if (page_id) {
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