import { useState } from "react";
import { Plus, Zap, Play, Pause, Settings2, Trash2, Copy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/EmptyState";

const mockRules = [
  {
    id: "1",
    name: "Auto-reply to new messages",
    description: "Send a greeting when a new message is received outside business hours",
    trigger_type: "new_message",
    is_active: true,
    auto_send: false,
    runs_count: 245,
  },
  {
    id: "2",
    name: "Lead detection",
    description: "Automatically create a lead when a phone number is detected",
    trigger_type: "keyword_match",
    is_active: true,
    auto_send: true,
    runs_count: 89,
  },
  {
    id: "3",
    name: "Follow-up reminder",
    description: "Tag conversation as needs follow-up after 24 hours of no response",
    trigger_type: "no_reply_timeout",
    is_active: false,
    auto_send: false,
    runs_count: 156,
  },
];

const mockTemplates = [
  {
    id: "1",
    name: "Welcome Message",
    category: "general",
    content: "Hi {{name}}! Thanks for reaching out to {{page}}. How can we help you today?",
    is_active: true,
  },
  {
    id: "2",
    name: "Order Follow-up",
    category: "followup",
    content: "Hi {{name}}, just checking in about your recent inquiry. Is there anything else we can help you with?",
    is_active: true,
  },
  {
    id: "3",
    name: "COD Confirmation",
    category: "cod",
    content: "Hi {{name}}! Your COD order has been confirmed. We'll deliver to your address on {{date}}. Total: {{amount}}",
    is_active: true,
  },
];

const triggerLabels: Record<string, string> = {
  new_message: "New Message",
  keyword_match: "Keyword Match",
  no_reply_timeout: "No Reply Timeout",
  followup_due: "Follow-up Due",
};

export default function Automation() {
  const [rules, setRules] = useState(mockRules);

  const toggleRule = (id: string) => {
    setRules(rules.map((rule) =>
      rule.id === id ? { ...rule, is_active: !rule.is_active } : rule
    ));
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Automation"
        description="Configure rules and templates for automated responses"
        action={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Rule
          </Button>
        }
      />

      <div className="p-6">
        <Tabs defaultValue="rules" className="space-y-6">
          <TabsList>
            <TabsTrigger value="rules">Automation Rules</TabsTrigger>
            <TabsTrigger value="templates">Reply Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-4">
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="metric-card">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">Total Rules</span>
                </div>
                <p className="mt-2 text-2xl font-bold">{rules.length}</p>
              </div>
              <div className="metric-card">
                <div className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-success" />
                  <span className="text-sm text-muted-foreground">Active</span>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {rules.filter((r) => r.is_active).length}
                </p>
              </div>
              <div className="metric-card">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Total Runs (30d)</span>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {rules.reduce((sum, r) => sum + r.runs_count, 0)}
                </p>
              </div>
            </div>

            {/* Rules List */}
            <div className="space-y-4">
              {rules.map((rule) => (
                <Card key={rule.id} className="animate-fade-in">
                  <CardContent className="flex items-center justify-between p-6">
                    <div className="flex items-start gap-4">
                      <div className={`rounded-lg p-2.5 ${rule.is_active ? "bg-primary/10" : "bg-muted"}`}>
                        <Zap className={`h-5 w-5 ${rule.is_active ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{rule.name}</h3>
                          <StatusBadge status={rule.is_active ? "active" : "pending"}>
                            {rule.is_active ? "Active" : "Paused"}
                          </StatusBadge>
                          {rule.auto_send && (
                            <StatusBadge status="warning" dot={false}>
                              Auto-send
                            </StatusBadge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {rule.description}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Trigger: {triggerLabels[rule.trigger_type]}</span>
                          <span>•</span>
                          <span>{rule.runs_count} runs</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => toggleRule(rule.id)}
                      />
                      <Button variant="ghost" size="icon">
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <div className="flex justify-end">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mockTemplates.map((template) => (
                <Card key={template.id} className="animate-fade-in">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        <StatusBadge status="info" dot={false}>
                          {template.category}
                        </StatusBadge>
                      </div>
                      <Switch checked={template.is_active} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {template.content}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
