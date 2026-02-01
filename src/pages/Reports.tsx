import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, TrendingUp, MessageSquare, Users, Clock } from "lucide-react";
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

const messageData = [
  { date: "Jan 20", messages: 120, replies: 115 },
  { date: "Jan 21", messages: 145, replies: 138 },
  { date: "Jan 22", messages: 98, replies: 92 },
  { date: "Jan 23", messages: 167, replies: 159 },
  { date: "Jan 24", messages: 189, replies: 180 },
  { date: "Jan 25", messages: 134, replies: 128 },
  { date: "Jan 26", messages: 156, replies: 148 },
];

const pageData = [
  { name: "Main Store", messages: 1245, leads: 28, responseTime: 4.2 },
  { name: "Support", messages: 892, leads: 12, responseTime: 3.8 },
  { name: "Sales", messages: 710, leads: 7, responseTime: 5.1 },
];

const leadFunnel = [
  { name: "Messages", value: 2847 },
  { name: "Phone Detected", value: 156 },
  { name: "Leads Created", value: 89 },
  { name: "Closed", value: 34 },
];

const COLORS = ["hsl(239, 84%, 67%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"];

const agentData = [
  { name: "John Doe", conversations: 234, replyRate: 96, avgTime: 3.2 },
  { name: "Jane Smith", conversations: 189, replyRate: 94, avgTime: 4.1 },
  { name: "Mike Johnson", conversations: 156, replyRate: 91, avgTime: 5.3 },
];

export default function Reports() {
  return (
    <div className="min-h-screen">
      <PageHeader
        title="Reports"
        description="Analyze your social inbox performance"
        action={
          <Button variant="outline">
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
            <TabsTrigger value="agents">Agent Performance</TabsTrigger>
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
                  <p className="mt-2 text-3xl font-bold">2,847</p>
                  <p className="text-xs text-success">+12.5% from last period</p>
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
                  <p className="mt-2 text-3xl font-bold">89</p>
                  <p className="text-xs text-success">+18% from last period</p>
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
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={messageData}>
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
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Agent Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Conversations Handled</th>
                        <th>Reply Rate</th>
                        <th>Avg Response Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentData.map((agent) => (
                        <tr key={agent.name}>
                          <td className="font-medium">{agent.name}</td>
                          <td>{agent.conversations}</td>
                          <td>
                            <span className="text-success">{agent.replyRate}%</span>
                          </td>
                          <td>{agent.avgTime}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                                width: `${(item.value / leadFunnel[0].value) * 100}%`,
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
