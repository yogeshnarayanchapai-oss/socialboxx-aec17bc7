import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is org admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRole } = await adminClient.rpc("get_org_role", { _user_id: caller.id });
    if (callerRole !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can invite members" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, name, role, organizationId, pageAccess } = await req.json();

    if (!email || !password || !organizationId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;

    if (existingUser) {
      // User exists - check if already in an org
      const { data: existingMember } = await adminClient
        .from("organization_members")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (existingMember) {
        return new Response(JSON.stringify({ error: "This user is already a team member." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = existingUser.id;
    } else {
      // Create new user with admin API (auto-confirmed)
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = newUser.user.id;
    }

    // Check if user is already in another org — if so, remove them first
    const { data: otherOrg } = await adminClient
      .from("organization_members")
      .select("id, organization_id")
      .eq("user_id", userId)
      .neq("organization_id", organizationId)
      .maybeSingle();

    if (otherOrg) {
      // Remove from other org
      await adminClient.from("organization_members").delete().eq("id", otherOrg.id);
      await adminClient.from("team_page_access").delete().eq("user_id", userId).eq("organization_id", otherOrg.organization_id);
    }

    // Remove auto-created org membership and org if this was a new signup trigger
    const { data: autoOrg } = await adminClient
      .from("organization_members")
      .select("id, organization_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (autoOrg && autoOrg.organization_id !== organizationId) {
      // Delete auto-created org and membership
      await adminClient.from("organization_members").delete().eq("id", autoOrg.id);
      await adminClient.from("organizations").delete().eq("id", autoOrg.organization_id).eq("owner_id", userId);
    }

    // Add to the target organization
    const { data: alreadyMember } = await adminClient
      .from("organization_members")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!alreadyMember) {
      const { error: memberError } = await adminClient
        .from("organization_members")
        .insert({
          organization_id: organizationId,
          user_id: userId,
          role: role || "agent",
          invited_by: caller.id,
        });
      if (memberError) throw memberError;
    }

    // Update user_roles table
    await adminClient
      .from("user_roles")
      .upsert({ user_id: userId, role: role || "agent" }, { onConflict: "user_id" });

    // Update profile name if provided
    if (name) {
      await adminClient
        .from("profiles")
        .update({ full_name: name })
        .eq("user_id", userId);
    }

    // Set page access
    if (pageAccess && typeof pageAccess === "object") {
      for (const [pageId, level] of Object.entries(pageAccess)) {
        if (level && level !== "none") {
          await adminClient
            .from("team_page_access")
            .upsert({
              user_id: userId,
              organization_id: organizationId,
              page_id: pageId,
              access_level: level as string,
              granted_by: caller.id,
            }, { onConflict: "user_id,page_id" });
        }
      }
    }

    return new Response(JSON.stringify({ userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
