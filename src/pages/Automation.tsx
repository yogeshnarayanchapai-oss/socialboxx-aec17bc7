import { useState } from "react";
import { Plus, Zap, Play, Pause, Settings2, Trash2, Copy, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { 
  useAutomationRules, 
  useReplyTemplates, 
  useCreateRule, 
  useToggleRule, 
  useDeleteRule,
  useCreateTemplate,
  useToggleTemplate,
  useDeleteTemplate,
} from "@/hooks/useAutomation";

const triggerLabels: Record<string, string> = {
  new_message: "New Message",
  keyword_match: "Keyword Match",
  no_reply_timeout: "No Reply Timeout",
  followup_due: "Follow-up Due",
};

export default function Automation() {
  const { data: rules = [], isLoading: loadingRules } = useAutomationRules();
  const { data: templates = [], isLoading: loadingTemplates } = useReplyTemplates();
  
  const createRule = useCreateRule();
  const toggleRule = useToggleRule();
  const deleteRule = useDeleteRule();
  const createTemplate = useCreateTemplate();
  const toggleTemplate = useToggleTemplate();
  const deleteTemplate = useDeleteTemplate();

  const [isRuleOpen, setIsRuleOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    description: "",
    trigger_type: "new_message",
    auto_send: false,
  });
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    category: "general",
    content: "",
  });

  const handleCreateRule = async () => {
    if (!newRule.name || !newRule.trigger_type) {
      toast.error("Please fill in required fields");
      return;
    }

    try {
      await createRule.mutateAsync(newRule);
      setIsRuleOpen(false);
      setNewRule({ name: "", description: "", trigger_type: "new_message", auto_send: false });
      toast.success("Rule created!");
    } catch (error) {
      toast.error("Failed to create rule");
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.content) {
      toast.error("Please fill in required fields");
      return;
    }

    try {
      await createTemplate.mutateAsync(newTemplate);
      setIsTemplateOpen(false);
      setNewTemplate({ name: "", category: "general", content: "" });
      toast.success("Template created!");
    } catch (error) {
      toast.error("Failed to create template");
    }
  };

  const handleToggleRule = async (id: string, isActive: boolean) => {
    try {
      await toggleRule.mutateAsync({ id, isActive: !isActive });
      toast.success(isActive ? "Rule paused" : "Rule activated");
    } catch (error) {
      toast.error("Failed to update rule");
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      await deleteRule.mutateAsync(id);
      toast.success("Rule deleted");
    } catch (error) {
      toast.error("Failed to delete rule");
    }
  };

  const handleToggleTemplate = async (id: string, isActive: boolean) => {
    try {
      await toggleTemplate.mutateAsync({ id, isActive: !isActive });
      toast.success(isActive ? "Template disabled" : "Template enabled");
    } catch (error) {
      toast.error("Failed to update template");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success("Template deleted");
    } catch (error) {
      toast.error("Failed to delete template");
    }
  };

  if (loadingRules || loadingTemplates) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Automation"
        description="Configure rules and templates for automated responses"
        action={
          <Dialog open={isRuleOpen} onOpenChange={setIsRuleOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Rule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Automation Rule</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Rule Name</Label>
                  <Input
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    placeholder="e.g., Auto-reply to new messages"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={newRule.description}
                    onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                    placeholder="What does this rule do?"
                  />
                </div>
                <div>
                  <Label>Trigger Type</Label>
                  <Select
                    value={newRule.trigger_type}
                    onValueChange={(value) => setNewRule({ ...newRule, trigger_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_message">New Message</SelectItem>
                      <SelectItem value="keyword_match">Keyword Match</SelectItem>
                      <SelectItem value="no_reply_timeout">No Reply Timeout</SelectItem>
                      <SelectItem value="followup_due">Follow-up Due</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Auto-send (no approval required)</Label>
                  <Switch
                    checked={newRule.auto_send}
                    onCheckedChange={(checked) => setNewRule({ ...newRule, auto_send: checked })}
                  />
                </div>
                <Button onClick={handleCreateRule} className="w-full" disabled={createRule.isPending}>
                  {createRule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Rule
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
                  <Pause className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Paused</span>
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {rules.filter((r) => !r.is_active).length}
                </p>
              </div>
            </div>

            {/* Rules List */}
            <div className="space-y-4">
              {rules.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No automation rules yet. Create one to get started.
                  </CardContent>
                </Card>
              ) : (
                rules.map((rule) => (
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
                            {rule.description || "No description"}
                          </p>
                          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Trigger: {triggerLabels[rule.trigger_type] || rule.trigger_type}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={rule.is_active || false}
                          onCheckedChange={() => handleToggleRule(rule.id, rule.is_active || false)}
                        />
                        <Button variant="ghost" size="icon">
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={isTemplateOpen} onOpenChange={setIsTemplateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Template
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Reply Template</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label>Template Name</Label>
                      <Input
                        value={newTemplate.name}
                        onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                        placeholder="e.g., Welcome Message"
                      />
                    </div>
                    <div>
                      <Label>Category</Label>
                      <Select
                        value={newTemplate.category}
                        onValueChange={(value) => setNewTemplate({ ...newTemplate, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">General</SelectItem>
                          <SelectItem value="followup">Follow-up</SelectItem>
                          <SelectItem value="cod">COD/Payment</SelectItem>
                          <SelectItem value="order">Order Tracking</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Content</Label>
                      <Textarea
                        value={newTemplate.content}
                        onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                        placeholder="Hi {{name}}! Thanks for reaching out..."
                        className="min-h-[100px]"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Available placeholders: {"{{name}}"}, {"{{phone}}"}, {"{{page}}"}, {"{{date}}"}
                      </p>
                    </div>
                    <Button onClick={handleCreateTemplate} className="w-full" disabled={createTemplate.isPending}>
                      {createTemplate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Create Template
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No templates yet. Create one to get started.
                  </CardContent>
                </Card>
              ) : (
                templates.map((template) => (
                  <Card key={template.id} className="animate-fade-in">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <StatusBadge status="info" dot={false}>
                            {template.category}
                          </StatusBadge>
                        </div>
                        <Switch 
                          checked={template.is_active || false}
                          onCheckedChange={() => handleToggleTemplate(template.id, template.is_active || false)}
                        />
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
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteTemplate(template.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
