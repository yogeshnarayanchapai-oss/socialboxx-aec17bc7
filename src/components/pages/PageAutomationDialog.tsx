import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdatePageSettings, type AutoReplyKeyword } from "@/hooks/usePageSettings";
import type { Json } from "@/integrations/supabase/types";

interface PageAutomationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: {
    id: string;
    page_name: string;
    automation_enabled?: boolean;
    auto_reply_first_message?: string;
    auto_reply_followup?: string;
    auto_reply_keywords?: Json;
  } | null;
}

export function PageAutomationDialog({
  open,
  onOpenChange,
  page,
}: PageAutomationDialogProps) {
  const updateSettings = useUpdatePageSettings();
  
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [firstMessage, setFirstMessage] = useState("");
  const [followupMessage, setFollowupMessage] = useState("");
  const [keywords, setKeywords] = useState<AutoReplyKeyword[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newReply, setNewReply] = useState("");

  useEffect(() => {
    if (page) {
      setAutomationEnabled(page.automation_enabled || false);
      setFirstMessage(page.auto_reply_first_message || "कृपया आफ्नो सम्पर्क नम्बर दिनुहोस्, हजुरलाई सम्पूर्ण जानकारी हामी कलमार्फत दिन्छौं।");
      setFollowupMessage(page.auto_reply_followup || "धन्यवाद! हामी छिट्टै सम्पर्क गर्नेछौं।");
      // Cast Json to AutoReplyKeyword[] safely
      const keywordsData = page.auto_reply_keywords;
      if (Array.isArray(keywordsData)) {
        setKeywords(keywordsData as unknown as AutoReplyKeyword[]);
      } else {
        setKeywords([]);
      }
    }
  }, [page]);

  const handleAddKeyword = () => {
    if (!newKeyword.trim() || !newReply.trim()) {
      toast.error("Please enter both keywords and reply");
      return;
    }

    const keywordList = newKeyword.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (keywordList.length === 0) {
      toast.error("Please enter at least one keyword");
      return;
    }

    setKeywords([...keywords, { keywords: keywordList, reply: newReply }]);
    setNewKeyword("");
    setNewReply("");
  };

  const handleRemoveKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!page) return;

    try {
      await updateSettings.mutateAsync({
        pageId: page.id,
        settings: {
          automation_enabled: automationEnabled,
          auto_reply_first_message: firstMessage,
          auto_reply_followup: followupMessage,
          auto_reply_keywords: keywords,
        },
      });
      toast.success("Automation settings saved!");
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Automation Settings</DialogTitle>
          <DialogDescription>
            Configure auto-reply rules for {page?.page_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Master Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base font-medium">Enable Automation</Label>
              <p className="text-sm text-muted-foreground">
                Turn on/off all auto-replies for this page
              </p>
            </div>
            <Switch
              checked={automationEnabled}
              onCheckedChange={setAutomationEnabled}
            />
          </div>

          {/* First Message Reply */}
          <div className="space-y-2">
            <Label>First Message Auto-Reply</Label>
            <p className="text-xs text-muted-foreground">
              Sent automatically when a new customer messages for the first time
            </p>
            <Textarea
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="Enter first message auto-reply..."
              rows={3}
            />
          </div>

          {/* Follow-up Message Reply */}
          <div className="space-y-2">
            <Label>Follow-up Auto-Reply (Optional)</Label>
            <p className="text-xs text-muted-foreground">
              Sent for subsequent messages (currently disabled to prevent spam)
            </p>
            <Textarea
              value={followupMessage}
              onChange={(e) => setFollowupMessage(e.target.value)}
              placeholder="Enter follow-up auto-reply..."
              rows={2}
              disabled
            />
          </div>

          {/* Keyword-based Replies */}
          <div className="space-y-3">
            <Label>Keyword Auto-Replies</Label>
            <p className="text-xs text-muted-foreground">
              When customer message contains these keywords, send the corresponding reply
            </p>

            {/* Existing Keywords */}
            {keywords.length > 0 && (
              <div className="space-y-2">
                {keywords.map((rule, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        Keywords: {rule.keywords.join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        Reply: {rule.reply}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 h-8 w-8 text-destructive"
                      onClick={() => handleRemoveKeyword(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Keyword */}
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <Input
                placeholder="Keywords (comma separated): price, cost, rate"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
              />
              <Textarea
                placeholder="Auto-reply message for these keywords..."
                value={newReply}
                onChange={(e) => setNewReply(e.target.value)}
                rows={2}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddKeyword}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Keyword Rule
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
