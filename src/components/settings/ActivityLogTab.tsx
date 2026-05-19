import { useQuery } from "@tanstack/react-query";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Trash2, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface LogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_label: string | null;
  user_email: string | null;
  metadata: any;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; color: string; icon: typeof Trash2 }> = {
  "lead.create": { label: "Lead Created", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: Plus },
  "lead.update": { label: "Lead Edited", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Pencil },
  "lead.delete": { label: "Lead Deleted", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: Trash2 },
  "message.delete": { label: "Message Deleted", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: Trash2 },
  "conversation.delete": { label: "Conversation Deleted", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: Trash2 },
  "conversation.soft_delete": { label: "Conversation Archived", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Trash2 },
};

function renderChanges(metadata: any) {
  const changes = metadata?.changes;
  if (changes && typeof changes === "object") {
    const entries = Object.entries(changes);
    if (entries.length === 0) return null;
    return (
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {entries.map(([field, val]) => {
          const [oldV, newV] = Array.isArray(val) ? val : [null, val];
          return (
            <div key={field}>
              <span className="font-medium">{field}:</span>{" "}
              <span className="line-through opacity-60">{String(oldV ?? "—")}</span>
              {" → "}
              <span>{String(newV ?? "—")}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (metadata?.preview) {
    return <p className="mt-1 text-xs text-muted-foreground italic truncate">"{metadata.preview}"</p>;
  }
  return null;
}

export function ActivityLogTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs" as any)
        .select("id, action, entity_type, entity_label, user_email, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as unknown) as LogRow[];
    },
    refetchInterval: 30000,
  });

  return (
    <TabsContent value="activity" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>
                कस्ले कुन समयमा lead/message edit वा delete गर्यो — सबै track हुन्छ। (Last 200 actions)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              अहिलेसम्म कुनै activity record भएको छैन।
            </p>
          ) : (
            <div className="space-y-2">
              {data.map((log) => {
                const meta = ACTION_META[log.action] || {
                  label: log.action,
                  color: "bg-muted text-foreground border-border",
                  icon: Activity,
                };
                const Icon = meta.icon;
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border ${meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={`${meta.color} text-xs`}>
                          {meta.label}
                        </Badge>
                        {log.entity_label && (
                          <span className="text-sm font-medium truncate">{log.entity_label}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">
                          {log.user_email || "System"}
                        </span>
                        {" • "}
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        {" • "}
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                      {renderChanges(log.metadata)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
