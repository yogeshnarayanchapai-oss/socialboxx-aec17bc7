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
import { Loader2, Plus, Trash2, Image, Video, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdatePageSettings, type AutoReplyKeyword } from "@/hooks/usePageSettings";
import type { Json } from "@/integrations/supabase/types";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface MediaAttachment {
  type: "image" | "video" | "link";
  url: string;
}

interface ExtendedAutoReplyKeyword extends AutoReplyKeyword {
  media?: MediaAttachment;
  enabled?: boolean;
}

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
  const [firstMessageEnabled, setFirstMessageEnabled] = useState(true);
  const [followupEnabled, setFollowupEnabled] = useState(false);
  const [firstMessage, setFirstMessage] = useState("");
  const [firstMessageMedia, setFirstMessageMedia] = useState<MediaAttachment | null>(null);
  const [followupMessage, setFollowupMessage] = useState("");
  const [followupMedia, setFollowupMedia] = useState<MediaAttachment | null>(null);
  const [keywords, setKeywords] = useState<ExtendedAutoReplyKeyword[]>([]);
  
  // New keyword form
  const [newKeyword, setNewKeyword] = useState("");
  const [newReply, setNewReply] = useState("");
  const [newMediaType, setNewMediaType] = useState<"image" | "video" | "link" | null>(null);
  const [newMediaUrl, setNewMediaUrl] = useState("");
  
  // Media input toggles
  const [showFirstMessageMedia, setShowFirstMessageMedia] = useState(false);
  const [showFollowupMedia, setShowFollowupMedia] = useState(false);

  useEffect(() => {
    if (page) {
      setAutomationEnabled(page.automation_enabled || false);
      setFirstMessage(page.auto_reply_first_message || "कृपया आफ्नो सम्पर्क नम्बर दिनुहोस्, हजुरलाई सम्पूर्ण जानकारी हामी कलमार्फत दिन्छौं।");
      setFollowupMessage(page.auto_reply_followup || "धन्यवाद! हामी छिट्टै सम्पर्क गर्नेछौं।");
      
      // Parse keywords from database
      const keywordsData = page.auto_reply_keywords;
      if (Array.isArray(keywordsData)) {
        const parsedKeywords = keywordsData.map((k: any) => ({
          keywords: k.keywords || [],
          reply: k.reply || "",
          media: k.media || null,
          enabled: k.enabled !== false, // default to true if not set
        }));
        setKeywords(parsedKeywords);
      } else {
        setKeywords([]);
      }
      
      // Check if first message has media stored (parse from JSON structure if needed)
      setFirstMessageMedia(null);
      setFollowupMedia(null);
    }
  }, [page]);

  const handleAddKeyword = () => {
    if (!newKeyword.trim() || !newReply.trim()) {
      toast.error("Keywords र Reply दुवै भर्नुहोस्");
      return;
    }

    const keywordList = newKeyword.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (keywordList.length === 0) {
      toast.error("कम्तीमा एउटा keyword राख्नुहोस्");
      return;
    }

    const newRule: ExtendedAutoReplyKeyword = {
      keywords: keywordList,
      reply: newReply,
      enabled: true,
    };
    
    if (newMediaType && newMediaUrl.trim()) {
      newRule.media = {
        type: newMediaType,
        url: newMediaUrl.trim(),
      };
    }

    setKeywords([...keywords, newRule]);
    setNewKeyword("");
    setNewReply("");
    setNewMediaType(null);
    setNewMediaUrl("");
    toast.success("Keyword rule थपियो");
  };

  const handleRemoveKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
    toast.success("Keyword rule हटाइयो");
  };

  const handleToggleKeyword = (index: number) => {
    const updated = [...keywords];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    setKeywords(updated);
  };

  const handleSave = async () => {
    if (!page) return;

    try {
      // Prepare data structure for saving
      const keywordsToSave = keywords.map(k => ({
        keywords: k.keywords,
        reply: k.reply,
        media: k.media || null,
        enabled: k.enabled !== false,
      }));

      // Build first message with media info
      let firstMsgContent = firstMessage;
      if (firstMessageMedia) {
        firstMsgContent = JSON.stringify({
          text: firstMessage,
          media: firstMessageMedia,
        });
      }

      // Build followup message with media info
      let followupMsgContent = followupMessage;
      if (followupMedia) {
        followupMsgContent = JSON.stringify({
          text: followupMessage,
          media: followupMedia,
        });
      }

      await updateSettings.mutateAsync({
        pageId: page.id,
        settings: {
          automation_enabled: automationEnabled,
          auto_reply_first_message: firstMsgContent,
          auto_reply_followup: followupMsgContent,
          auto_reply_keywords: keywordsToSave,
        },
      });
      toast.success("Settings save भयो!");
      onOpenChange(false);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Settings save गर्न सकिएन");
    }
  };

  const MediaTypeButton = ({ 
    type, 
    icon: Icon, 
    selected, 
    onClick 
  }: { 
    type: string; 
    icon: any; 
    selected: boolean; 
    onClick: () => void;
  }) => (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="h-8"
    >
      <Icon className="h-3 w-3 mr-1" />
      {type}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Automation Settings</DialogTitle>
          <DialogDescription>
            {page?.page_name} को auto-reply rules configure गर्नुहोस्
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Master Toggle */}
          <div className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${
            automationEnabled ? 'border-green-500/50 bg-green-500/5' : 'border-dashed'
          }`}>
            <div>
              <Label className="text-base font-medium">Enable Automation</Label>
              <p className="text-sm text-muted-foreground">
                यस page को सबै auto-replies {automationEnabled ? 'सक्रिय छ' : 'बन्द छ'}
              </p>
            </div>
            <Switch
              checked={automationEnabled}
              onCheckedChange={setAutomationEnabled}
            />
          </div>

          {/* First Message Reply */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">First Message Auto-Reply</Label>
                <p className="text-xs text-muted-foreground">
                  नयाँ customer ले पहिलो पटक message गर्दा automatic reply
                </p>
              </div>
              <Switch
                checked={firstMessageEnabled}
                onCheckedChange={setFirstMessageEnabled}
              />
            </div>
            
            {firstMessageEnabled && (
              <>
                <Textarea
                  value={firstMessage}
                  onChange={(e) => setFirstMessage(e.target.value)}
                  placeholder="First message auto-reply..."
                  rows={3}
                />
                
                {/* Media attachment for first message */}
                <Collapsible open={showFirstMessageMedia} onOpenChange={setShowFirstMessageMedia}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-xs">
                      <Plus className="h-3 w-3 mr-1" />
                      {showFirstMessageMedia ? 'Media Hide गर्नुहोस्' : 'Image/Video/Link थप्नुहोस्'}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <div className="flex gap-2">
                      <MediaTypeButton 
                        type="Image" 
                        icon={Image} 
                        selected={firstMessageMedia?.type === 'image'}
                        onClick={() => setFirstMessageMedia(firstMessageMedia?.type === 'image' ? null : { type: 'image', url: '' })}
                      />
                      <MediaTypeButton 
                        type="Video" 
                        icon={Video} 
                        selected={firstMessageMedia?.type === 'video'}
                        onClick={() => setFirstMessageMedia(firstMessageMedia?.type === 'video' ? null : { type: 'video', url: '' })}
                      />
                      <MediaTypeButton 
                        type="Link" 
                        icon={Link2} 
                        selected={firstMessageMedia?.type === 'link'}
                        onClick={() => setFirstMessageMedia(firstMessageMedia?.type === 'link' ? null : { type: 'link', url: '' })}
                      />
                    </div>
                    {firstMessageMedia && (
                      <Input
                        placeholder={`${firstMessageMedia.type === 'image' ? 'Image' : firstMessageMedia.type === 'video' ? 'Facebook Video' : 'Link'} URL...`}
                        value={firstMessageMedia.url}
                        onChange={(e) => setFirstMessageMedia({ ...firstMessageMedia, url: e.target.value })}
                      />
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </div>

          {/* Follow-up Message Reply */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Follow-up Auto-Reply</Label>
                <p className="text-xs text-muted-foreground">
                  दोस्रो/पछिको messages मा automatic reply
                </p>
              </div>
              <Switch
                checked={followupEnabled}
                onCheckedChange={setFollowupEnabled}
              />
            </div>
            
            {followupEnabled && (
              <>
                <Textarea
                  value={followupMessage}
                  onChange={(e) => setFollowupMessage(e.target.value)}
                  placeholder="Follow-up auto-reply..."
                  rows={2}
                />
                
                {/* Media attachment for followup */}
                <Collapsible open={showFollowupMedia} onOpenChange={setShowFollowupMedia}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-xs">
                      <Plus className="h-3 w-3 mr-1" />
                      {showFollowupMedia ? 'Media Hide गर्नुहोस्' : 'Image/Video/Link थप्नुहोस्'}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <div className="flex gap-2">
                      <MediaTypeButton 
                        type="Image" 
                        icon={Image} 
                        selected={followupMedia?.type === 'image'}
                        onClick={() => setFollowupMedia(followupMedia?.type === 'image' ? null : { type: 'image', url: '' })}
                      />
                      <MediaTypeButton 
                        type="Video" 
                        icon={Video} 
                        selected={followupMedia?.type === 'video'}
                        onClick={() => setFollowupMedia(followupMedia?.type === 'video' ? null : { type: 'video', url: '' })}
                      />
                      <MediaTypeButton 
                        type="Link" 
                        icon={Link2} 
                        selected={followupMedia?.type === 'link'}
                        onClick={() => setFollowupMedia(followupMedia?.type === 'link' ? null : { type: 'link', url: '' })}
                      />
                    </div>
                    {followupMedia && (
                      <Input
                        placeholder={`${followupMedia.type === 'image' ? 'Image' : followupMedia.type === 'video' ? 'Facebook Video' : 'Link'} URL...`}
                        value={followupMedia.url}
                        onChange={(e) => setFollowupMedia({ ...followupMedia, url: e.target.value })}
                      />
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </div>

          {/* Keyword-based Replies */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-sm font-medium">Keyword Auto-Replies</Label>
            <p className="text-xs text-muted-foreground">
              Message मा यी keywords आउँदा corresponding reply पठाउने
            </p>

            {/* Existing Keywords */}
            {keywords.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {keywords.map((rule, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-2 rounded-lg border p-3 transition-colors ${
                      rule.enabled ? 'bg-background' : 'bg-muted/50 opacity-60'
                    }`}
                  >
                    <Switch
                      checked={rule.enabled !== false}
                      onCheckedChange={() => handleToggleKeyword(index)}
                      className="mt-1 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {rule.keywords.join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {rule.reply}
                      </p>
                      {rule.media && (
                        <p className="text-xs text-blue-500 mt-1">
                          📎 {rule.media.type}: {rule.media.url.substring(0, 30)}...
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveKeyword(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Keyword */}
            <div className="space-y-3 rounded-lg border border-dashed p-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground">नयाँ Keyword Rule थप्नुहोस्</p>
              <Input
                placeholder="Keywords (comma separated): price, cost, rate"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
              />
              <Textarea
                placeholder="Auto-reply message..."
                value={newReply}
                onChange={(e) => setNewReply(e.target.value)}
                rows={2}
              />
              
              {/* Media for new keyword */}
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <MediaTypeButton 
                    type="Image" 
                    icon={Image} 
                    selected={newMediaType === 'image'}
                    onClick={() => setNewMediaType(newMediaType === 'image' ? null : 'image')}
                  />
                  <MediaTypeButton 
                    type="Video" 
                    icon={Video} 
                    selected={newMediaType === 'video'}
                    onClick={() => setNewMediaType(newMediaType === 'video' ? null : 'video')}
                  />
                  <MediaTypeButton 
                    type="Link" 
                    icon={Link2} 
                    selected={newMediaType === 'link'}
                    onClick={() => setNewMediaType(newMediaType === 'link' ? null : 'link')}
                  />
                </div>
                {newMediaType && (
                  <Input
                    placeholder={`${newMediaType === 'image' ? 'Image' : newMediaType === 'video' ? 'Facebook Video' : 'Link'} URL...`}
                    value={newMediaUrl}
                    onChange={(e) => setNewMediaUrl(e.target.value)}
                  />
                )}
              </div>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddKeyword}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Keyword Rule थप्नुहोस्
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
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
