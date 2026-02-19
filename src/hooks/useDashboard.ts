import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserAccess } from "@/hooks/useUserAccess";

export type DashboardDateFilter = "today" | "yesterday" | "7d" | "custom";

export function getDateRange(filter: DashboardDateFilter, customFrom?: string, customTo?: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case "today":
      return { from: today.toISOString(), to: now.toISOString() };
    case "yesterday": {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return { from: yesterday.toISOString(), to: today.toISOString() };
    }
    case "7d": {
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: sevenDaysAgo.toISOString(), to: now.toISOString() };
    }
    case "custom":
      return {
        from: customFrom || today.toISOString(),
        to: customTo || now.toISOString(),
      };
    default:
      return { from: today.toISOString(), to: now.toISOString() };
  }
}

export function useDashboardStats(dateFilter: DashboardDateFilter = "today", customFrom?: string, customTo?: string) {
  const { accessiblePageIds, isLoading: isAccessLoading } = useUserAccess();
  const { from, to } = getDateRange(dateFilter, customFrom, customTo);

  return useQuery({
    queryKey: ["dashboard-stats", accessiblePageIds, dateFilter, from, to],
    queryFn: async () => {
      if (accessiblePageIds !== null && accessiblePageIds !== undefined && accessiblePageIds.length === 0) {
        return {
          totalMessages: 0, unrepliedCount: 0, leadsPending: 0, followUpsDue: 0,
          replyRate: "0%", todayFollowupTotal: 0,
          todayFollowupAI: 0, todayFollowupAutomation: 0,
        };
      }

      const now = new Date();

      let convQuery = supabase
        .from("conversations")
        .select("id, status, last_message_at, created_at, page_id")
        .is("deleted_at", null)
        .gte("last_message_at", from)
        .lte("last_message_at", to);
      if (accessiblePageIds !== null && accessiblePageIds !== undefined) convQuery = convQuery.in("page_id", accessiblePageIds);

      let leadsQuery = supabase.from("leads").select("id, status, followup_due_date, page_id")
        .gte("created_at", from).lte("created_at", to);
      if (accessiblePageIds !== null && accessiblePageIds !== undefined) leadsQuery = leadsQuery.in("page_id", accessiblePageIds);

      let followupQuery = supabase
        .from("followup_logs")
        .select("id, followup_type, page_id")
        .gte("sent_at", from).lte("sent_at", to);
      if (accessiblePageIds !== null && accessiblePageIds !== undefined) followupQuery = followupQuery.in("page_id", accessiblePageIds);

      const [{ data: conversations }, { data: leads }, { data: followups }] = await Promise.all([
        convQuery, leadsQuery, followupQuery,
      ]);

      const convIds = conversations?.map(c => c.id) ?? [];
      let messagesData: any[] = [];
      if (convIds.length > 0) {
        const { data: messages } = await supabase
          .from("messages")
          .select("id, sender_type, created_at")
          .gte("created_at", from)
          .lte("created_at", to)
          .in("conversation_id", convIds.slice(0, 500));
        messagesData = messages ?? [];
      }

      const todayFollowupTotal = followups?.length || 0;
      const todayFollowupAI = followups?.filter(f => f.followup_type === "ai").length || 0;
      const todayFollowupAutomation = followups?.filter(f => f.followup_type === "automation").length || 0;

      const totalMessages = messagesData.length;
      const unrepliedCount = conversations?.filter(c => c.status === "unreplied").length || 0;
      const leadsPending = leads?.filter(l => l.status === "new" || l.status === "hot").length || 0;
      const followUpsDue = leads?.filter(l => {
        if (!l.followup_due_date) return false;
        return new Date(l.followup_due_date) <= now && l.status !== "closed";
      }).length || 0;

      const incomingMessages = messagesData.filter(m => m.sender_type === "customer").length;
      const outgoingMessages = messagesData.filter(m => m.sender_type === "page").length;
      const replyRate = incomingMessages > 0 ? Math.round((outgoingMessages / incomingMessages) * 100) : 0;

      return {
        totalMessages,
        unrepliedCount,
        leadsPending,
        followUpsDue,
        replyRate: `${Math.min(replyRate, 100)}%`,
        todayFollowupTotal,
        todayFollowupAI,
        todayFollowupAutomation,
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

export function usePagePerformance(dateFilter: DashboardDateFilter = "today", customFrom?: string, customTo?: string) {
  const { accessiblePageIds, isLoading: isAccessLoading } = useUserAccess();
  const { from, to } = getDateRange(dateFilter, customFrom, customTo);

  return useQuery({
    queryKey: ["page-performance", accessiblePageIds, dateFilter, from, to],
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

      // Batch: get all conversations for all pages at once
      const allPageIds = pages.map(p => p.id);
      const { data: allConvs } = await supabase
        .from("conversations")
        .select("id, page_id")
        .in("page_id", allPageIds)
        .is("deleted_at", null);

      const convsByPage = new Map<string, string[]>();
      (allConvs || []).forEach(c => {
        const arr = convsByPage.get(c.page_id) || [];
        arr.push(c.id);
        convsByPage.set(c.page_id, arr);
      });

      // Batch: get all message counts at once
      const allConvIds = (allConvs || []).map(c => c.id);
      let messageCounts = new Map<string, number>();

      if (allConvIds.length > 0) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", allConvIds.slice(0, 1000))
          .gte("created_at", from)
          .lte("created_at", to);

        // Map conversation_id back to page_id
        const convToPage = new Map<string, string>();
        (allConvs || []).forEach(c => convToPage.set(c.id, c.page_id));

        (msgs || []).forEach(m => {
          const pageId = convToPage.get(m.conversation_id);
          if (pageId) {
            messageCounts.set(pageId, (messageCounts.get(pageId) || 0) + 1);
          }
        });
      }

      const performance = pages.map(page => ({
        name: page.page_name,
        messages: messageCounts.get(page.id) || 0,
      }));

      // Sort by messages descending
      performance.sort((a, b) => b.messages - a.messages);
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
