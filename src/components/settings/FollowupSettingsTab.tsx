import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, X, Play, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  useFollowupSettings,
  useUpdateFollowupSettings,
  triggerFollowupNow,
} from "@/hooks/useFollowupSettings";

function normalizeTime(t: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

export function FollowupSettingsTab() {
  const { data, isLoading } = useFollowupSettings();
  const update = useUpdateFollowupSettings();
  const [newTime, setNewTime] = useState("08:00");
  const [running, setRunning] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const enabled = !!data?.enabled;
  const times = data?.schedule_times ?? [];

  const toggle = async (v: boolean) => {
    try {
      await update.mutateAsync({ enabled: v });
      toast.success(v ? "Scheduled followups enabled" : "Scheduled followups disabled");
    } catch (e) {
      toast.error("Failed to update");
    }
  };

  const addTime = async () => {
    const t = normalizeTime(newTime);
    if (!t) return toast.error("Invalid time. Use HH:MM (24h).");
    if (times.includes(t)) return toast.error("Already added");
    try {
      await update.mutateAsync({ schedule_times: [...times, t].sort() });
      setNewTime("08:00");
      toast.success(`Added ${t}`);
    } catch {
      toast.error("Failed to add");
    }
  };

  const removeTime = async (t: string) => {
    try {
      await update.mutateAsync({ schedule_times: times.filter((x) => x !== t) });
    } catch {
      toast.error("Failed to remove");
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { sent } = await triggerFollowupNow();
      toast.success(`Follow-ups sent: ${sent}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to run");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Follow-up Automation</CardTitle>
          <CardDescription>
            Send follow-up messages on schedule (Nepal Time). Step 1 goes to customers with no reply yet.
            Step N goes only to conversations already tagged <code className="text-xs">followup-{"{N-1}"}</code>.
            Conversations tagged <code className="text-xs">lead-created</code> are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Enable scheduled follow-ups</Label>
              <p className="text-sm text-muted-foreground">
                When off, follow-ups only run when you click "Run Now".
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={toggle} disabled={update.isPending} />
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Schedule times (Nepal Time)
              </Label>
              <p className="text-sm text-muted-foreground">
                Add the times of day when follow-ups should auto-run. e.g. 08:00, 21:00.
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-40"
              />
              <Button onClick={addTime} disabled={update.isPending} size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {times.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No times added yet.</p>
              )}
              {times.map((t) => (
                <div
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-sm"
                >
                  <span className="font-mono">{t}</span>
                  <button
                    onClick={() => removeTime(t)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${t}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <Button onClick={runNow} disabled={running} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run Follow-ups Now
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Processes all eligible conversations across your pages immediately.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
