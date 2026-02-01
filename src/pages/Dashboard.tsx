import {
  MessageSquare,
  AlertCircle,
  Users,
  Clock,
  TrendingUp,
  Send,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Mock data for demonstration
const metrics = [
  {
    title: "Total Messages (7d)",
    value: "2,847",
    change: "+12.5% from last week",
    changeType: "positive" as const,
    icon: MessageSquare,
  },
  {
    title: "Unreplied Messages",
    value: "23",
    change: "3 urgent",
    changeType: "negative" as const,
    icon: AlertCircle,
  },
  {
    title: "Leads Pending",
    value: "47",
    change: "+8 today",
    changeType: "neutral" as const,
    icon: Users,
  },
  {
    title: "Avg Response Time",
    value: "4.2m",
    change: "-23% from last week",
    changeType: "positive" as const,
    icon: Clock,
  },
  {
    title: "Reply Rate",
    value: "94.2%",
    change: "+2.1% from last week",
    changeType: "positive" as const,
    icon: TrendingUp,
  },
  {
    title: "Follow-ups Due",
    value: "12",
    change: "5 overdue",
    changeType: "negative" as const,
    icon: Send,
  },
];

const recentConversations = [
  { name: "John Smith", page: "Main Store", message: "When will my order arrive?", time: "2m ago", status: "unreplied" },
  { name: "Sarah Johnson", page: "Support", message: "Thank you for helping!", time: "15m ago", status: "replied" },
  { name: "Mike Davis", page: "Main Store", message: "Do you have this in blue?", time: "32m ago", status: "unreplied" },
  { name: "Emma Wilson", page: "Sales", message: "I'd like to place a bulk order", time: "1h ago", status: "lead" },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen">
      <PageHeader
        title="Dashboard"
        description="Overview of your social inbox performance"
      />

      <div className="p-6">
        {/* Metrics Grid */}
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

        {/* Recent Activity */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Conversations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {recentConversations.map((conv, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                        {conv.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="font-medium">{conv.name}</p>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {conv.message}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{conv.time}</p>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Page Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: "Main Store", messages: 1245, leads: 28, rate: "96%" },
                  { name: "Support", messages: 892, leads: 12, rate: "91%" },
                  { name: "Sales", messages: 710, leads: 7, rate: "94%" },
                ].map((page) => (
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
