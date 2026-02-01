import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  AlertCircle,
  Users,
  Clock,
  TrendingUp,
  Send,
  Loader2,
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
      title: "Total Messages (7d)",
      value: stats?.totalMessages7d?.toLocaleString() || "0",
      change: "Last 7 days",
      changeType: "neutral" as const,
      icon: MessageSquare,
    },
    {
      title: "Unreplied Messages",
      value: stats?.unrepliedCount?.toString() || "0",
      change: stats?.unrepliedCount && stats.unrepliedCount > 0 ? "Needs attention" : "All caught up",
      changeType: (stats?.unrepliedCount || 0) > 0 ? "negative" as const : "positive" as const,
      icon: AlertCircle,
    },
    {
      title: "Leads Pending",
      value: stats?.leadsPending?.toString() || "0",
      change: "New & Hot leads",
      changeType: "neutral" as const,
      icon: Users,
    },
    {
      title: "Avg Response Time",
      value: stats?.avgResponseTime || "—",
      change: "Calculated average",
      changeType: "neutral" as const,
      icon: Clock,
    },
    {
      title: "Reply Rate",
      value: stats?.replyRate || "0%",
      change: "Last 7 days",
      changeType: "positive" as const,
      icon: TrendingUp,
    },
    {
      title: "Follow-ups Due",
      value: stats?.followUpsDue?.toString() || "0",
      change: stats?.followUpsDue && stats.followUpsDue > 0 ? "Action needed" : "No pending",
      changeType: (stats?.followUpsDue || 0) > 0 ? "negative" as const : "positive" as const,
      icon: Send,
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
      <PageHeader
        title="Dashboard"
        description="Overview of your social inbox performance"
      />

      <div className="p-6">
        {/* Metrics Grid */}
        {loadingStats ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((metric) => (
              <MetricCard
                key={metric.title}
                title={metric.title}
                value={metric.value}
                change={metric.change}
                changeType={metric.changeType}
                icon={metric.icon}
              />
            ))}
          </div>
        )}

        {/* Recent Activity */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Conversations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentConversations.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No conversations yet
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentConversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => navigate("/inbox")}
                      className="flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                          {conv.participant_name?.split(" ").map((n: string) => n[0]).join("").substring(0, 2) || "?"}
                        </div>
                        <div>
                          <p className="font-medium">{conv.participant_name || "Unknown"}</p>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {conv.last_message_preview || "No messages"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {formatTime(conv.last_message_at)}
                        </p>
                        <span
                          className={`status-badge mt-1 ${
                            conv.status === "unreplied"
                              ? "bg-warning/10 text-warning"
                              : conv.status === "lead"
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {conv.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Page Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : pagePerformance.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No pages connected yet
                </div>
              ) : (
                <div className="space-y-4">
                  {pagePerformance.map((page) => (
                    <div key={page.name} className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{page.name}</p>
                          <span className="text-sm text-muted-foreground">
                            {page.messages} messages
                          </span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: page.rate }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
