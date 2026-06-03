import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/hooks/useUserAccess";

export function useDashboardStats() {
  const { accessiblePageIds, isLoading: isAccessLoading } = useUserAccess();

  return useQuery({
    queryKey: ["dashboard-stats", accessiblePageIds],
    queryFn: async () => {
      if (accessiblePageIds !== null && accessiblePageIds !== undefined && accessiblePageIds.length === 0) {
        return {
          totalMessagesToday: 0, aiMessagesToday: 0, unrepliedCount: 0, leadsPending: 0, followUpsDue: 0,
          replyRate: "0%", avgResponseTime: "N/A", todayFollowupTotal: 0,
          todayFollowupAI: 0, todayFollowupAutomation: 0, aiFailedCount: 0,
          todayLeadsCreated: 0,
        };
      }

      const now = new Date();
      const today = new Date(nepalTodayStartISO());
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const pageFilter = (accessiblePageIds !== null && accessiblePageIds !== undefined) ? accessiblePageIds : null;

      let unrepliedQuery = supabase.from("conversations").select("id", { count: "exact", head: true })
        .is("deleted_at", null).eq("status", "unreplied");
      if (pageFilter) unrepliedQuery = unrepliedQuery.in("page_id", pageFilter);

      let aiFailedQuery = supabase.from("conversations").select("id", { count: "exact", head: true })
        .is("deleted_at", null).eq("status", "ai_failed");
      if (pageFilter) aiFailedQuery = aiFailedQuery.in("page_id", pageFilter);

      let leadsQuery = supabase.from("leads").select("id, status, followup_due_date, page_id");
      if (pageFilter) leadsQuery = leadsQuery.in("page_id", pageFilter);

      let followupQuery = supabase.from("followup_logs").select("id, followup_type, page_id")
        .gte("sent_at", today.toISOString());
      if (pageFilter) followupQuery = followupQuery.in("page_id", pageFilter);

      let todayLeadsQuery = supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("created_at", today.toISOString());
      if (pageFilter) todayLeadsQuery = todayLeadsQuery.in("page_id", pageFilter);

      const customerMsgQuery = supabase.from("messages").select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo.toISOString()).eq("sender_type", "customer");
      const pageMsgQuery = supabase.from("messages").select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo.toISOString()).eq("sender_type", "page");

      const [
        { count: unrepliedCount },
        { count: aiFailedCount },
        { data: leads },
        { data: todayFollowups },
        { count: todayLeadsCreated },
        { count: incomingMessages },
        { count: outgoingMessages },
      ] = await Promise.all([
        unrepliedQuery, aiFailedQuery, leadsQuery, followupQuery,
        todayLeadsQuery, customerMsgQuery, pageMsgQuery,
      ]);

      // Paginate today's customer messages, scoped to accessible pages via join, to count unique conversations
      const uniqueConvsToday = new Set<string>();
      const PAGE_SIZE = 1000;
      let from = 0;
      for (let i = 0; i < 50; i++) {
        let q = supabase.from("messages")
          .select("conversation_id, conversations!inner(page_id, deleted_at)")
          .eq("sender_type", "customer")
          .gte("created_at", today.toISOString())
          .is("conversations.deleted_at", null)
          .range(from, from + PAGE_SIZE - 1);
        if (pageFilter) q = q.in("conversations.page_id", pageFilter);
        const { data: batch, error } = await q;
        if (error || !batch || batch.length === 0) break;
        for (const row of batch as any[]) {
          if (row.conversation_id) uniqueConvsToday.add(row.conversation_id);
        }
        from += PAGE_SIZE;
      }
      const totalMessagesToday = uniqueConvsToday.size;

      const todayFollowupTotal = todayFollowups?.length || 0;
      const todayFollowupAI = todayFollowups?.filter(f => f.followup_type === "ai").length || 0;
      const todayFollowupAutomation = todayFollowups?.filter(f => f.followup_type === "automation").length || 0;

      const leadsPending = leads?.filter((l: any) => l.status === "new").length || 0;
      const followUpsDue = leads?.filter(l => {
        if (!l.followup_due_date) return false;
        return new Date(l.followup_due_date) <= now && l.status !== "closed";
      }).length || 0;

      const incoming = incomingMessages || 0;
      const outgoing = outgoingMessages || 0;
      const replyRate = incoming > 0 ? Math.round((outgoing / incoming) * 100) : 0;

      return {
        totalMessagesToday,
        unrepliedCount: unrepliedCount || 0,
        aiFailedCount: aiFailedCount || 0,
        leadsPending,
        followUpsDue,
        replyRate: `${Math.min(replyRate, 100)}%`,
        avgResponseTime: "4.2m",
        todayFollowupTotal,
        todayFollowupAI,
        todayFollowupAutomation,
        todayLeadsCreated: todayLeadsCreated || 0,
      };
    },
    enabled: !isAccessLoading && accessiblePageIds !== undefined,
  });
}

export function useRecentConversations(limit = 5) {
  const { accessiblePageIds, isLoading: isAccessLoading } = useUserAccess();

  return useQuery({
    queryKey: ["recent-conversations", limit, accessiblePageIds],
    queryFn: async () => {
      if (accessiblePageIds !== null && accessiblePageIds !== undefined && accessiblePageIds.length === 0) return [];

      let query = supabase
        .from("conversations")
        .select("*, connected_pages(page_name)")
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false })
        .limit(limit);

      if (accessiblePageIds !== null && accessiblePageIds !== undefined) query = query.in("page_id", accessiblePageIds);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !isAccessLoading && accessiblePageIds !== undefined,
  });
}

// Nepal Time (UTC+5:45) start of "today" as a UTC ISO string
function nepalTodayStartISO(): string {
  const NEPAL_OFFSET_MIN = 5 * 60 + 45;
  const now = new Date();
  const nepalNow = new Date(now.getTime() + NEPAL_OFFSET_MIN * 60 * 1000);
  const y = nepalNow.getUTCFullYear();
  const m = nepalNow.getUTCMonth();
  const d = nepalNow.getUTCDate();
  // Midnight in Nepal expressed as UTC
  const utcMs = Date.UTC(y, m, d) - NEPAL_OFFSET_MIN * 60 * 1000;
  return new Date(utcMs).toISOString();
}

export function usePagePerformance() {
  const { accessiblePageIds, isLoading: isAccessLoading } = useUserAccess();

  return useQuery({
    queryKey: ["page-performance", accessiblePageIds],
    queryFn: async () => {
      let query = supabase
        .from("connected_pages")
        .select("id, page_name")
        .eq("connection_status", "active");

      if (accessiblePageIds !== null && accessiblePageIds !== undefined) {
        if (accessiblePageIds.length === 0) return [];
        query = query.in("id", accessiblePageIds);
      }

      const { data: pages } = await query;
      if (!pages?.length) return [];

      const pageIds = pages.map(p => p.id);
      const todayStartISO = nepalTodayStartISO();

      // Paginate today's customer messages joined with conversations to filter by page_id
      // This avoids the .in(conversation_id, [...]) cap when a page has many conversations.
      const PAGE_SIZE = 1000;
      const msgsByConvByPage = new Map<string, Set<string>>(); // page_id -> set of conv_ids
      let from = 0;
      // safety cap: 50k rows per day
      for (let i = 0; i < 50; i++) {
        const { data: batch, error } = await supabase
          .from("messages")
          .select("conversation_id, conversations!inner(page_id, deleted_at)")
          .eq("sender_type", "customer")
          .gte("created_at", todayStartISO)
          .in("conversations.page_id", pageIds)
          .is("conversations.deleted_at", null)
          .range(from, from + PAGE_SIZE - 1);
        if (error || !batch || batch.length === 0) break;
        for (const row of batch as any[]) {
          const pid = row.conversations?.page_id;
          if (!pid) continue;
          if (!msgsByConvByPage.has(pid)) msgsByConvByPage.set(pid, new Set());
          msgsByConvByPage.get(pid)!.add(row.conversation_id);
        }
        from += PAGE_SIZE;
      }

      // Today's leads per page (paginated for safety)
      const todayLeadCountByPage = new Map<string, number>();
      let lfrom = 0;
      for (let i = 0; i < 50; i++) {
        const { data: batch, error } = await supabase
          .from("leads")
          .select("page_id")
          .in("page_id", pageIds)
          .gte("created_at", todayStartISO)
          .range(lfrom, lfrom + PAGE_SIZE - 1);
        if (error || !batch || batch.length === 0) break;
        for (const l of batch) {
          if (l.page_id) todayLeadCountByPage.set(l.page_id, (todayLeadCountByPage.get(l.page_id) || 0) + 1);
        }
        lfrom += PAGE_SIZE;
      }

      const performance = pages.map(page => ({
        name: page.page_name,
        messages: msgsByConvByPage.get(page.id)?.size || 0,
        leads: todayLeadCountByPage.get(page.id) || 0,
        rate: "95%",
      })).sort((a, b) => (b.messages + b.leads) - (a.messages + a.leads));

      return performance;
    },
    enabled: !isAccessLoading && accessiblePageIds !== undefined,
  });
}

export function useReportsData(period: "7d" | "30d" = "7d") {
  return useQuery({
    queryKey: ["reports-data", period],
    queryFn: async () => {
      const days = period === "7d" ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: messages } = await supabase
        .from("messages")
        .select("created_at, sender_type")
        .gte("created_at", startDate.toISOString());

      const messagesByDate = new Map<string, { messages: number; replies: number }>();
      
      messages?.forEach(msg => {
        const date = new Date(msg.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const existing = messagesByDate.get(date) || { messages: 0, replies: 0 };
        if (msg.sender_type === "customer") {
          existing.messages++;
        } else {
          existing.replies++;
        }
        messagesByDate.set(date, existing);
      });

      const chartData = Array.from(messagesByDate.entries()).map(([date, data]) => ({
        date,
        ...data,
      }));

      const { data: leads } = await supabase.from("leads").select("status");

      const { count: totalMessages } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_type", "customer")
        .gte("created_at", startDate.toISOString());

      const leadFunnel = [
        { name: "Messages", value: totalMessages || 0 },
        { name: "Phone Detected", value: leads?.length || 0 },
        { name: "Leads Created", value: leads?.filter(l => l.status !== "new").length || 0 },
        { name: "Closed", value: leads?.filter(l => l.status === "closed").length || 0 },
      ];

      return {
        chartData,
        leadFunnel,
        totalMessages: totalMessages || 0,
        leadsCreated: leads?.length || 0,
      };
    },
  });
}
