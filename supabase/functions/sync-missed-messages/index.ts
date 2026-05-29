import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MediaAttachment {
  type: "image" | "video" | "audio" | "link";
  url: string;
}

async function sendMessage(
  pageAccessToken: string,
  recipientId: string,
  text: string,
  media?: MediaAttachment | null,
): Promise<boolean> {
  try {
    if (text) {
      let r = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          access_token: pageAccessToken,
        }),
      });
      if (!r.ok) {
        try {
          const err = await r.clone().json();
          const sub = err?.error?.error_subcode;
          const msg = String(err?.error?.message || "").toLowerCase();
          if (sub === 2018278 || msg.includes("outside of allowed window") || msg.includes("outside the allowed window")) {
            r = await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text },
                messaging_type: "MESSAGE_TAG",
                tag: "HUMAN_AGENT",
                access_token: pageAccessToken,
              }),
            });
          }
        } catch (_) { /* ignore */ }
      }
      if (!r.ok) {
        console.error("send text failed", await r.text());
        return false;
      }
    }
    if (media?.url) {
      let payload: any = null;
      if (media.type === "image") payload = { attachment: { type: "image", payload: { url: media.url, is_reusable: true } } };
      else if (media.type === "video") payload = { attachment: { type: "video", payload: { url: media.url, is_reusable: true } } };
      else if (media.type === "audio") payload = { attachment: { type: "audio", payload: { url: media.url, is_reusable: true } } };
      else if (media.type === "link") payload = { attachment: { type: "template", payload: { template_type: "button", text: "🔗 Link:", buttons: [{ type: "web_url", url: media.url, title: "Open Link" }] } } };
      if (payload) {
        await fetch(`https://graph.facebook.com/v19.0/me/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { id: recipientId }, message: payload, access_token: pageAccessToken }),
        });
      }
    }
    return true;
  } catch (e) {
    console.error("sendMessage error", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identify caller's org via their JWT
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: orgMember } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!orgMember?.organization_id) {
      return new Response(JSON.stringify({ error: "No organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgId = orgMember.organization_id as string;

    // 1) Fetch active connected pages for the org
    const { data: pages, error: pagesErr } = await admin
      .from("connected_pages")
      .select("id, page_id, page_name, page_access_token, connection_status, first_msg_template, first_msg_template_enabled, ai_enabled, automation_enabled, auto_reply_first_message")
      .eq("organization_id", orgId)
      .eq("connection_status", "active");

    if (pagesErr) throw pagesErr;
    if (!pages || pages.length === 0) {
      return new Response(JSON.stringify({ success: true, pages: 0, synced_conversations: 0, synced_messages: 0, templates_sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalConversations = 0;
    let totalMessages = 0;
    let templatesSent = 0;
    const errors: string[] = [];

    // 2) For each page, invoke facebook-messages to sync, then run template pass
    for (const page of pages) {
      try {
        const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/facebook-messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ action: "fetch_conversations", pageId: page.id }),
        });
        const syncJson = await syncRes.json().catch(() => ({}));
        if (syncRes.ok) {
          totalConversations += syncJson.conversations || 0;
          totalMessages += syncJson.messages || 0;
        } else {
          errors.push(`${page.page_name}: ${syncJson?.error || "sync failed"}`);
        }
      } catch (e) {
        errors.push(`${page.page_name}: ${e instanceof Error ? e.message : "sync error"}`);
      }

      // 3) Template pass: send 1st template to convos with customer msgs but no page reply yet
      const tmplCfg: any = (page as any).first_msg_template;
      const tmplList: any[] = Array.isArray(tmplCfg?.messages)
        ? tmplCfg.messages.filter((m: any) => m && (m.text || m.media))
        : [];
      const tmplEnabled = (page as any).first_msg_template_enabled && page.ai_enabled && !page.automation_enabled && tmplList.length > 0;
      if (!tmplEnabled) continue;

      const firstTmpl = tmplList[0];

      // Find unreplied conversations for this page
      const { data: convos } = await admin
        .from("conversations")
        .select("id, participant_id, status, deleted_at")
        .eq("page_id", page.id)
        .is("deleted_at", null)
        .in("status", ["unreplied", "ai_processing"]);

      if (!convos || convos.length === 0) continue;

      for (const conv of convos) {
        if (!conv.participant_id) continue;

        // Has at least one customer message?
        const { count: custCount } = await admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("sender_type", "customer");
        if (!custCount || custCount === 0) continue;

        // Has zero page replies?
        const { count: pageCount } = await admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("sender_type", "page");
        if ((pageCount || 0) > 0) continue;

        const ok = await sendMessage(
          page.page_access_token,
          conv.participant_id,
          firstTmpl.text || "",
          firstTmpl.media || null,
        );

        if (ok) {
          if (firstTmpl.text) {
            await admin.from("messages").insert({
              conversation_id: conv.id,
              content: firstTmpl.text,
              sender_type: "page",
              message_type: firstTmpl.media ? "media" : "text",
              media_url: firstTmpl.media?.url || null,
              created_at: new Date().toISOString(),
            });
          }
          await admin.from("conversations").update({
            status: "replied",
            last_message_preview: (firstTmpl.text || "[Template sent]").substring(0, 100),
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", conv.id);
          templatesSent++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pages: pages.length,
        synced_conversations: totalConversations,
        synced_messages: totalMessages,
        templates_sent: templatesSent,
        errors: errors.length ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync-missed-messages error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
