import { useState, useEffect, useRef } from "react";
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
import { Loader2, Plus, Trash2, Image, Video, Link2, Upload, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useUpdatePageSettings, type AutoReplyKeyword } from "@/hooks/usePageSettings";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

interface MediaAttachment {
  type: "image" | "video" | "link";
  url: string;
}

interface ExtendedAutoReplyKeyword extends AutoReplyKeyword {
  media?: MediaAttachment;
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
  
  // Edit keyword state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editKeyword, setEditKeyword] = useState("");
  const [editReply, setEditReply] = useState("");
  const [editMediaType, setEditMediaType] = useState<"image" | "video" | "link" | null>(null);
  const [editMediaUrl, setEditMediaUrl] = useState("");
  
  // Upload states
  const [uploadingFirst, setUploadingFirst] = useState(false);
  const [uploadingFollowup, setUploadingFollowup] = useState(false);
  const [uploadingKeyword, setUploadingKeyword] = useState(false);
  
  // File input refs
  const firstMediaRef = useRef<HTMLInputElement>(null);
  const followupMediaRef = useRef<HTMLInputElement>(null);
  const keywordMediaRef = useRef<HTMLInputElement>(null);
  const editMediaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (page) {
      setAutomationEnabled(page.automation_enabled || false);
      
      // Parse first message (could be JSON with media or plain text)
      try {
        const firstMsgData = page.auto_reply_first_message ? JSON.parse(page.auto_reply_first_message) : null;
        if (firstMsgData && typeof firstMsgData === 'object' && firstMsgData.text) {
          setFirstMessage(firstMsgData.text);
          setFirstMessageMedia(firstMsgData.media || null);
        } else {
          setFirstMessage(page.auto_reply_first_message || "कृपया आफ्नो सम्पर्क नम्बर दिनुहोस्, हजुरलाई सम्पूर्ण जानकारी हामी कलमार्फत दिन्छौं।");
          setFirstMessageMedia(null);
        }
      } catch {
        setFirstMessage(page.auto_reply_first_message || "कृपया आफ्नो सम्पर्क नम्बर दिनुहोस्, हजुरलाई सम्पूर्ण जानकारी हामी कलमार्फत दिन्छौं।");
        setFirstMessageMedia(null);
      }
      
      // Parse followup message
      try {
        const followupData = page.auto_reply_followup ? JSON.parse(page.auto_reply_followup) : null;
        if (followupData && typeof followupData === 'object' && followupData.text) {
          setFollowupMessage(followupData.text);
          setFollowupMedia(followupData.media || null);
        } else {
          setFollowupMessage(page.auto_reply_followup || "धन्यवाद! हामी छिट्टै सम्पर्क गर्नेछौं।");
          setFollowupMedia(null);
        }
      } catch {
        setFollowupMessage(page.auto_reply_followup || "धन्यवाद! हामी छिट्टै सम्पर्क गर्नेछौं।");
        setFollowupMedia(null);
      }
      
      // Parse keywords from database
      const keywordsData = page.auto_reply_keywords;
      if (Array.isArray(keywordsData) && keywordsData.length > 0) {
        const parsedKeywords = keywordsData.map((k: any) => ({
          keywords: k.keywords || [],
          reply: k.reply || "",
          media: k.media || null,
        }));
        setKeywords(parsedKeywords);
      } else {
        setKeywords([]);
      }
    }
  }, [page, open]);

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${page?.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('automation-media')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error("Image upload गर्न सकिएन");
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('automation-media')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Image upload गर्न सकिएन");
      return null;
    }
  };

  const handleFirstMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingFirst(true);
    const url = await uploadImage(file);
    if (url) {
      setFirstMessageMedia({ type: 'image', url });
      toast.success("Image upload भयो!");
    }
    setUploadingFirst(false);
    if (firstMediaRef.current) firstMediaRef.current.value = '';
  };

  const handleFollowupMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingFollowup(true);
    const url = await uploadImage(file);
    if (url) {
      setFollowupMedia({ type: 'image', url });
      toast.success("Image upload भयो!");
    }
    setUploadingFollowup(false);
    if (followupMediaRef.current) followupMediaRef.current.value = '';
  };

  const handleKeywordMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingKeyword(true);
    const url = await uploadImage(file);
    if (url) {
      setNewMediaType('image');
      setNewMediaUrl(url);
      toast.success("Image upload भयो!");
    }
    setUploadingKeyword(false);
    if (keywordMediaRef.current) keywordMediaRef.current.value = '';
  };

  const handleEditMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingKeyword(true);
    const url = await uploadImage(file);
    if (url) {
      setEditMediaType('image');
      setEditMediaUrl(url);
      toast.success("Image upload भयो!");
    }
    setUploadingKeyword(false);
    if (editMediaRef.current) editMediaRef.current.value = '';
  };

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

  const startEditKeyword = (index: number) => {
    const rule = keywords[index];
    setEditingIndex(index);
    setEditKeyword(rule.keywords.join(", "));
    setEditReply(rule.reply);
    setEditMediaType(rule.media?.type || null);
    setEditMediaUrl(rule.media?.url || "");
  };

  const saveEditKeyword = () => {
    if (editingIndex === null) return;
    
    if (!editKeyword.trim() || !editReply.trim()) {
      toast.error("Keywords र Reply दुवै भर्नुहोस्");
      return;
    }

    const keywordList = editKeyword.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    
    const updatedRule: ExtendedAutoReplyKeyword = {
      keywords: keywordList,
      reply: editReply,
    };
    
    if (editMediaType && editMediaUrl.trim()) {
      updatedRule.media = {
        type: editMediaType,
        url: editMediaUrl.trim(),
      };
    }

    const updated = [...keywords];
    updated[editingIndex] = updatedRule;
    setKeywords(updated);
    setEditingIndex(null);
    setEditKeyword("");
    setEditReply("");
    setEditMediaType(null);
    setEditMediaUrl("");
    toast.success("Keyword rule update भयो");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditKeyword("");
    setEditReply("");
    setEditMediaType(null);
    setEditMediaUrl("");
  };

  const handleSave = async () => {
    if (!page) return;

    try {
      // Prepare keywords data
      const keywordsToSave = keywords.map(k => ({
        keywords: k.keywords,
        reply: k.reply,
        media: k.media || null,
      }));

      // Build first message with media info
      let firstMsgContent: string;
      if (firstMessageMedia) {
        firstMsgContent = JSON.stringify({
          text: firstMessage,
          media: firstMessageMedia,
        });
      } else {
        firstMsgContent = firstMessage;
      }

      // Build followup message with media info
      let followupMsgContent: string;
      if (followupMedia) {
        followupMsgContent = JSON.stringify({
          text: followupMessage,
          media: followupMedia,
        });
      } else {
        followupMsgContent = followupMessage;
      }

      console.log("Saving settings:", {
        automationEnabled,
        keywordsToSave,
        firstMsgContent,
        followupMsgContent,
      });

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

  const MediaButtons = ({ 
    selectedType, 
    onSelectType,
    onUploadClick,
    isUploading,
  }: { 
    selectedType: "image" | "video" | "link" | null;
    onSelectType: (type: "image" | "video" | "link" | null) => void;
    onUploadClick: () => void;
    isUploading: boolean;
  }) => (
    <div className="flex gap-2 flex-wrap">
      <Button
        type="button"
        variant={selectedType === 'image' ? "default" : "outline"}
        size="sm"
        onClick={onUploadClick}
        disabled={isUploading}
        className="h-8"
      >
        {isUploading ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <Upload className="h-3 w-3 mr-1" />
        )}
        Image Upload
      </Button>
      <Button
        type="button"
        variant={selectedType === 'video' ? "default" : "outline"}
        size="sm"
        onClick={() => onSelectType(selectedType === 'video' ? null : 'video')}
        className="h-8"
      >
        <Video className="h-3 w-3 mr-1" />
        Video URL
      </Button>
      <Button
        type="button"
        variant={selectedType === 'link' ? "default" : "outline"}
        size="sm"
        onClick={() => onSelectType(selectedType === 'link' ? null : 'link')}
        className="h-8"
      >
        <Link2 className="h-3 w-3 mr-1" />
        Link
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Automation Settings</DialogTitle>
          <DialogDescription>
            {page?.page_name} को auto-reply configure गर्नुहोस्
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Master Toggle - Only One */}
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
            <div>
              <Label className="text-sm font-medium">First Message Auto-Reply</Label>
              <p className="text-xs text-muted-foreground">
                नयाँ customer ले पहिलो पटक message गर्दा automatic reply
              </p>
            </div>
            
            <Textarea
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="First message auto-reply..."
              rows={3}
            />
            
            {/* Media for first message */}
            <input
              ref={firstMediaRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFirstMediaUpload}
            />
            
            {firstMessageMedia && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                {firstMessageMedia.type === 'image' && (
                  <img src={firstMessageMedia.url} alt="Media" className="h-12 w-12 object-cover rounded" />
                )}
                <span className="text-xs text-muted-foreground flex-1 truncate">
                  {firstMessageMedia.type}: {firstMessageMedia.url.substring(0, 40)}...
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setFirstMessageMedia(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            
            <MediaButtons
              selectedType={firstMessageMedia?.type || null}
              onSelectType={(type) => {
                if (type === 'video' || type === 'link') {
                  setFirstMessageMedia(type ? { type, url: '' } : null);
                }
              }}
              onUploadClick={() => firstMediaRef.current?.click()}
              isUploading={uploadingFirst}
            />
            
            {firstMessageMedia && (firstMessageMedia.type === 'video' || firstMessageMedia.type === 'link') && (
              <Input
                placeholder={`${firstMessageMedia.type === 'video' ? 'Facebook Video' : 'Link'} URL...`}
                value={firstMessageMedia.url}
                onChange={(e) => setFirstMessageMedia({ ...firstMessageMedia, url: e.target.value })}
              />
            )}
          </div>

          {/* Follow-up Message Reply */}
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Follow-up Auto-Reply</Label>
              <p className="text-xs text-muted-foreground">
                दोस्रो/पछिको messages मा automatic reply
              </p>
            </div>
            
            <Textarea
              value={followupMessage}
              onChange={(e) => setFollowupMessage(e.target.value)}
              placeholder="Follow-up auto-reply..."
              rows={2}
            />
            
            {/* Media for followup */}
            <input
              ref={followupMediaRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFollowupMediaUpload}
            />
            
            {followupMedia && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                {followupMedia.type === 'image' && (
                  <img src={followupMedia.url} alt="Media" className="h-12 w-12 object-cover rounded" />
                )}
                <span className="text-xs text-muted-foreground flex-1 truncate">
                  {followupMedia.type}: {followupMedia.url.substring(0, 40)}...
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setFollowupMedia(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            
            <MediaButtons
              selectedType={followupMedia?.type || null}
              onSelectType={(type) => {
                if (type === 'video' || type === 'link') {
                  setFollowupMedia(type ? { type, url: '' } : null);
                }
              }}
              onUploadClick={() => followupMediaRef.current?.click()}
              isUploading={uploadingFollowup}
            />
            
            {followupMedia && (followupMedia.type === 'video' || followupMedia.type === 'link') && (
              <Input
                placeholder={`${followupMedia.type === 'video' ? 'Facebook Video' : 'Link'} URL...`}
                value={followupMedia.url}
                onChange={(e) => setFollowupMedia({ ...followupMedia, url: e.target.value })}
              />
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
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {keywords.map((rule, index) => (
                  <div key={index}>
                    {editingIndex === index ? (
                      // Edit mode
                      <div className="space-y-2 rounded-lg border-2 border-primary p-3">
                        <Input
                          value={editKeyword}
                          onChange={(e) => setEditKeyword(e.target.value)}
                          placeholder="Keywords (comma separated)"
                        />
                        <Textarea
                          value={editReply}
                          onChange={(e) => setEditReply(e.target.value)}
                          placeholder="Reply message..."
                          rows={2}
                        />
                        
                        <input
                          ref={editMediaRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleEditMediaUpload}
                        />
                        
                        {editMediaUrl && (
                          <div className="flex items-center gap-2 p-2 bg-muted rounded">
                            {editMediaType === 'image' && (
                              <img src={editMediaUrl} alt="Media" className="h-10 w-10 object-cover rounded" />
                            )}
                            <span className="text-xs flex-1 truncate">{editMediaUrl.substring(0, 30)}...</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditMediaType(null); setEditMediaUrl(""); }}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => editMediaRef.current?.click()} disabled={uploadingKeyword}>
                            {uploadingKeyword ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                            Image
                          </Button>
                          <Button size="sm" variant={editMediaType === 'video' ? "default" : "outline"} onClick={() => { setEditMediaType('video'); setEditMediaUrl(''); }}>
                            <Video className="h-3 w-3 mr-1" />Video
                          </Button>
                          <Button size="sm" variant={editMediaType === 'link' ? "default" : "outline"} onClick={() => { setEditMediaType('link'); setEditMediaUrl(''); }}>
                            <Link2 className="h-3 w-3 mr-1" />Link
                          </Button>
                        </div>
                        
                        {editMediaType && editMediaType !== 'image' && (
                          <Input
                            value={editMediaUrl}
                            onChange={(e) => setEditMediaUrl(e.target.value)}
                            placeholder={`${editMediaType === 'video' ? 'Video' : 'Link'} URL...`}
                          />
                        )}
                        
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" onClick={saveEditKeyword}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <div className="flex items-start gap-2 rounded-lg border p-3 bg-background">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {rule.keywords.join(", ")}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {rule.reply}
                          </p>
                          {rule.media && (
                            <div className="flex items-center gap-2 mt-1">
                              {rule.media.type === 'image' && (
                                <img src={rule.media.url} alt="Media" className="h-8 w-8 object-cover rounded" />
                              )}
                              <span className="text-xs text-blue-500">
                                📎 {rule.media.type}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => startEditKeyword(index)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveKeyword(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
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
              <input
                ref={keywordMediaRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleKeywordMediaUpload}
              />
              
              {newMediaUrl && (
                <div className="flex items-center gap-2 p-2 bg-background rounded">
                  {newMediaType === 'image' && (
                    <img src={newMediaUrl} alt="Media" className="h-10 w-10 object-cover rounded" />
                  )}
                  <span className="text-xs flex-1 truncate">{newMediaUrl.substring(0, 30)}...</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setNewMediaType(null); setNewMediaUrl(""); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              <div className="flex gap-2 flex-wrap">
                <Button 
                  type="button" 
                  size="sm" 
                  variant="outline"
                  onClick={() => keywordMediaRef.current?.click()}
                  disabled={uploadingKeyword}
                >
                  {uploadingKeyword ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                  Image Upload
                </Button>
                <Button
                  type="button"
                  variant={newMediaType === 'video' ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setNewMediaType(newMediaType === 'video' ? null : 'video'); setNewMediaUrl(''); }}
                >
                  <Video className="h-3 w-3 mr-1" />
                  Video URL
                </Button>
                <Button
                  type="button"
                  variant={newMediaType === 'link' ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setNewMediaType(newMediaType === 'link' ? null : 'link'); setNewMediaUrl(''); }}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Link
                </Button>
              </div>
              
              {newMediaType && newMediaType !== 'image' && (
                <Input
                  placeholder={`${newMediaType === 'video' ? 'Facebook Video' : 'Link'} URL...`}
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                />
              )}
              
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
