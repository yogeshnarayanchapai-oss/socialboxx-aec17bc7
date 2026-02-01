import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, TrendingUp, MessageSquare, Users, Clock, Loader2 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useReportsData } from "@/hooks/useDashboard";
import { useLeadStats } from "@/hooks/useLeads";
import { useConnectedPages } from "@/hooks/usePages";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

const COLORS = ["hsl(239, 84%, 67%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"];

export default function Reports() {
  const { data: reportsData, isLoading: loadingReports } = useReportsData("7d");
  const { data: leadStats } = useLeadStats();
  const { data: pages = [] } = useConnectedPages();

  // Get page performance data
  const { data: pageData = [] } = useQuery({
    queryKey: ["page-report-data"],
    queryFn: async () => {
      if (pages.length === 0) return [];

      const pageStats = await Promise.all(
        pages.map(async (page) => {
          const { count: messageCount } = await supabase
            .from("conversations")
            .select("id", { count: "exact", head: true })
            .eq("page_id", page.id);

          const { count: leadCount } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("page_id", page.id);

          return {
            name: page.page_name,
            messages: messageCount || 0,
            leads: leadCount || 0,
            responseTime: 4.2,
          };
        })
      );

      return pageStats;
    },
    enabled: pages.length > 0,
  });

  const leadFunnel = [
    { name: "Messages", value: reportsData?.totalMessages || 0 },
    { name: "Phone Detected", value: leadStats?.total || 0 },
    { name: "Leads Created", value: (leadStats?.hot || 0) + (leadStats?.follow_up || 0) + (leadStats?.closed || 0) },
    { name: "Closed", value: leadStats?.closed || 0 },
  ];

  const handleExport = () => {
    toast.info("Export feature coming soon!");
  };

  if (loadingReports) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Reports"
        description="Analyze your social inbox performance"
        action={
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pages">By Page</TabsTrigger>
            <TabsTrigger value="leads">Lead Funnel</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <span className="text-sm text-muted-foreground">Total Messages</span>
                  </div>
                  <p className="mt-2 text-3xl font-bold">{reportsData?.totalMessages?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">Last 7 days</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-success" />
                    <span className="text-sm text-muted-foreground">Reply Rate</span>
                  </div>
                  <p className="mt-2 text-3xl font-bold">94.2%</p>
                  <p className="text-xs text-success">+2.1% from last period</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-warning" />
                    <span className="text-sm text-muted-foreground">Leads Created</span>
                  </div>
                  <p className="mt-2 text-3xl font-bold">{leadStats?.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Total leads</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-info" />
                    <span className="text-sm text-muted-foreground">Avg Response</span>
                  </div>
                  <p className="mt-2 text-3xl font-bold">4.2m</p>
                  <p className="text-xs text-success">-23% from last period</p>
                </CardContent>
              </Card>
            </div>

            {/* Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Messages & Replies (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  {reportsData?.chartData && reportsData.chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reportsData.chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="messages"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary) / 0.2)"
                          name="Messages"
                        />
                        <Area
                          type="monotone"
                          dataKey="replies"
                          stroke="hsl(var(--success))"
                          fill="hsl(var(--success) / 0.2)"
                          name="Replies"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      No data available for the selected period
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pages" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Page Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  {pageData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pageData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={100} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar dataKey="messages" fill="hsl(var(--primary))" name="Messages" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      No pages connected yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Lead Funnel</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={leadFunnel}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {leadFunnel.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Funnel Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {leadFunnel.map((item, idx) => (
                      <div key={item.name} className="flex items-center gap-4">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: COLORS[idx] }}
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{item.name}</p>
                            <p className="font-bold">{item.value.toLocaleString()}</p>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${leadFunnel[0].value > 0 ? (item.value / leadFunnel[0].value) * 100 : 0}%`,
                                backgroundColor: COLORS[idx],
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
