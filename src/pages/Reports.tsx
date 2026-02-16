import { useState, useMemo } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, MessageSquare, Users, TrendingUp, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useConnectedPages } from "@/hooks/usePages";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { startOfDay, subDays, startOfWeek, startOfMonth, format } from "date-fns";

type DateRange = "today" | "yesterday" | "7d" | "30d" | "this_week" | "this_month" | "all";

function getDateRange(range: DateRange): { from: string | null; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (range) {
    case "today":
      return { from: startOfDay(now).toISOString(), to };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y).toISOString(), to: startOfDay(now).toISOString() };
    }
    case "7d":
      return { from: subDays(now, 7).toISOString(), to };
    case "30d":
      return { from: subDays(now, 30).toISOString(), to };
    case "this_week":
      return { from: startOfWeek(now, { weekStartsOn: 0 }).toISOString(), to };
    case "this_month":
      return { from: startOfMonth(now).toISOString(), to };
    case "all":
      return { from: null, to };
  }
}

function conversionRate(leads: number, conversations: number): string {
  if (conversations === 0) return "0%";
  return ((leads / conversations) * 100).toFixed(1) + "%";
}

export default function Reports() {
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const { data: pages = [] } = useConnectedPages();

  const { from, to } = useMemo(() => getDateRange(dateRange), [dateRange]);

  // Overall stats
  const { data: overallStats, isLoading } = useQuery({
    queryKey: ["report-overall", dateRange],
    queryFn: async () => {
      let convQuery = supabase.from("conversations").select("id", { count: "exact", head: true });
      let leadQuery = supabase.from("leads").select("id", { count: "exact", head: true });

      if (from) {
        convQuery = convQuery.gte("created_at", from).lte("created_at", to);
        leadQuery = leadQuery.gte("created_at", from).lte("created_at", to);
      }

      const [convRes, leadRes] = await Promise.all([convQuery, leadQuery]);
      return {
        totalConversations: convRes.count || 0,
        totalLeads: leadRes.count || 0,
      };
    },
  });

  // Per-page stats
  const { data: pageStats = [], isLoading: loadingPages } = useQuery({
    queryKey: ["report-by-page", dateRange, pages.map(p => p.id)],
    queryFn: async () => {
      if (pages.length === 0) return [];

      const results = await Promise.all(
        pages.map(async (page) => {
          let convQuery = supabase.from("conversations").select("id", { count: "exact", head: true }).eq("page_id", page.id);
          let leadQuery = supabase.from("leads").select("id", { count: "exact", head: true }).eq("page_id", page.id);

          if (from) {
            convQuery = convQuery.gte("created_at", from).lte("created_at", to);
            leadQuery = leadQuery.gte("created_at", from).lte("created_at", to);
          }

          const [convRes, leadRes] = await Promise.all([convQuery, leadQuery]);
          const conversations = convRes.count || 0;
          const leads = leadRes.count || 0;

          return {
            name: page.page_name,
            conversations,
            leads,
            rate: conversations > 0 ? parseFloat(((leads / conversations) * 100).toFixed(1)) : 0,
          };
        })
      );

      return results;
    },
    enabled: pages.length > 0,
  });

  const dateLabel = {
    today: "Today",
    yesterday: "Yesterday",
    "7d": "Last 7 Days",
    "30d": "Last 30 Days",
    this_week: "This Week",
    this_month: "This Month",
    all: "All Time",
  }[dateRange];

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Reports"
        description="Analyze conversation to lead conversion"
        action={
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="p-6">
        <Tabs defaultValue="overall" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overall">Overall</TabsTrigger>
            <TabsTrigger value="bypage">By Page</TabsTrigger>
          </TabsList>

          {/* Overall Tab */}
          <TabsContent value="overall" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground">Total Conversations</span>
                      </div>
                      <p className="mt-2 text-3xl font-bold">{overallStats?.totalConversations.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{dateLabel}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-success" />
                        <span className="text-sm text-muted-foreground">Total Leads</span>
                      </div>
                      <p className="mt-2 text-3xl font-bold">{overallStats?.totalLeads.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{dateLabel}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-warning" />
                        <span className="text-sm text-muted-foreground">Conversion Rate</span>
                      </div>
                      <p className="mt-2 text-3xl font-bold">
                        {conversionRate(overallStats?.totalLeads || 0, overallStats?.totalConversations || 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">Leads / Conversations</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Bar chart if pages exist */}
                {pageStats.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Conversations vs Leads</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={pageStats}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            <Bar dataKey="conversations" fill="hsl(var(--primary))" name="Conversations" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="leads" fill="hsl(var(--success))" name="Leads" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* By Page Tab */}
          <TabsContent value="bypage" className="space-y-6">
            {loadingPages ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : pageStats.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                No pages connected yet
              </div>
            ) : (
              <div className="grid gap-4">
                {pageStats.map((page) => (
                  <Card key={page.name}>
                    <CardContent className="p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-lg">{page.name}</h3>
                          <p className="text-xs text-muted-foreground">{dateLabel}</p>
                        </div>
                        <div className="flex gap-6">
                          <div className="text-center">
                            <p className="text-2xl font-bold">{page.conversations.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">Conversations</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-success">{page.leads.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">Leads</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-warning">{page.rate}%</p>
                            <p className="text-xs text-muted-foreground">Conversion</p>
                          </div>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-success transition-all"
                          style={{ width: `${Math.min(page.rate, 100)}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
