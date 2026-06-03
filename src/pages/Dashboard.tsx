import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  AlertCircle,
  Users,
  Clock,
  TrendingUp,
  Send,
  Loader2,
  Bot,
  Zap,
  Star,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStats, useRecentConversations, usePagePerformance } from "@/hooks/useDashboard";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading: loadingStats } = useDashboardStats();
  const { data: recentConversations = [], isLoading: loadingConversations } = useRecentConversations();
  const { data: pagePerformance = [], isLoading: loadingPages } = usePagePerformance();

  const metrics = [
    {
      title: "Messages Today",
      value: `${(stats?.totalMessagesToday || 0).toLocaleString()} / ${(stats?.aiMessagesToday || 0).toLocaleString()}`,
      change: "Unique customers / AI replies",
      changeType: "neutral" as const,
      icon: MessageSquare,
      href: "/inbox",
    },
    {
      title: "Today's Leads",
      value: stats?.todayLeadsCreated || 0,
      change: "New leads created today",
      changeType: "positive" as const,
      icon: Star,
      href: "/leads",
    },
    {
      title: "Unreplied",
      value: stats?.unrepliedCount || 0,
      change: stats?.unrepliedCount && stats.unrepliedCount > 0 ? "Needs attention" : "All caught up",
      changeType: (stats?.unrepliedCount || 0) > 0 ? "negative" as const : "positive" as const,
      icon: AlertCircle,
      href: "/inbox?filter=unreplied",
    },
    {
      title: "Total AI Fail",
      value: stats?.aiFailedCount || 0,
      change: (stats?.aiFailedCount || 0) > 0 ? "Needs retry" : "All good",
      changeType: (stats?.aiFailedCount || 0) > 0 ? "negative" as const : "positive" as const,
      icon: Bot,
      href: "/inbox?filter=ai_failed",
    },
    {
      title: "Leads Pending",
      value: stats?.leadsPending || 0,
      change: "New & Hot leads",
      changeType: "neutral" as const,
      icon: Users,
      href: "/leads",
    },
    {
      title: "Today Follow-ups & Due",
      value: (stats?.todayFollowupTotal || 0) + (stats?.followUpsDue || 0),
      change: `Sent: ${stats?.todayFollowupTotal || 0} | Due: ${stats?.followUpsDue || 0}`,
      changeType: (stats?.followUpsDue || 0) > 0 ? "negative" as const : "neutral" as const,
      icon: Send,
      href: "/inbox?filter=follow-up",
    },
  ];

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen">
      <PageHeader title="Dashboard" description="Overview of your inbox performance" />

      <div className="p-4 md:p-6">
        {loadingStats ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {metrics.map((metric) => (
              <MetricCard key={metric.title} title={metric.title} value={metric.value} change={metric.change} changeType={metric.changeType} icon={metric.icon} href={metric.href} />
            ))}
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-base md:text-lg">Recent Conversations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingConversations ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : recentConversations.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No conversations yet</div>
              ) : (
                <div className="divide-y divide-border">
                  {recentConversations.slice(0, 5).map((conv) => (
                    <div key={conv.id} onClick={() => navigate("/inbox")}
                      className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                          {conv.participant_name?.split(" ").map((n: string) => n[0]).join("").substring(0, 2) || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{conv.participant_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground truncate">{conv.last_message_preview || "No messages"}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">{formatTime(conv.last_message_at)}</p>
                        <span className={`status-badge mt-1 text-xs ${
                          conv.status === "unreplied" ? "bg-warning/10 text-warning"
                          : conv.status === "lead" ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                        }`}>{conv.status}</span>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => navigate("/inbox")} className="w-full px-4 md:px-6 py-3 text-sm font-medium text-primary hover:bg-muted/50 transition-colors text-center">
                    See more →
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 md:p-6">
              <CardTitle className="text-base md:text-lg">Page Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
              {loadingPages ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : pagePerformance.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No pages connected yet</div>
              ) : (
                <div className="space-y-4">
                  {pagePerformance.slice(0, 5).map((page) => (
                    <div key={page.name} className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm truncate">{page.name}</p>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {page.messages} msgs | {page.leads} leads
                            {page.messages > 0 && (
                              <span className="ml-1.5 text-emerald-500 font-semibold">
                                {Math.round((page.leads / page.messages) * 100)}%
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: page.rate }} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => navigate("/pages")} className="w-full pt-2 text-sm font-medium text-primary hover:underline text-center">
                    See more →
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
