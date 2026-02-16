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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2, Image, Video, Link2, Upload, X, Pencil, ChevronLeft, ChevronRight, MessageSquare, Bot, FileAudio } from "lucide-react";
import { toast } from "sonner";
import { useUpdatePageSettings, type AutoReplyKeyword } from "@/hooks/usePageSettings";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface MediaAttachment {
  type: "image" | "video" | "link" | "audio";
  url: string;
}

interface ReplyMessage {
  text: string;
  media?: MediaAttachment | null;
}

interface ExtendedAutoReplyKeyword extends AutoReplyKeyword {
  media?: MediaAttachment;
}

interface AiFollowupStep {
  delay_hours: number;
  message_hint: string;
  media?: MediaAttachment | null;
}

interface AiFollowupSettings {
  enabled: boolean;
  steps: AiFollowupStep[];
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
    auto_reply_messages?: Json;
    auto_followup_messages?: Json;
    ai_enabled?: boolean;
    ai_description?: string;
    ai_instructions?: string;
    ai_comment_hint?: string;
    comment_auto_reply?: string;
    product_name?: string;
    product_description?: string;
    ai_followup_settings?: Json;
    ai_comment_reply_enabled?: boolean;
  } | null;
}

const DEFAULT_FIRST_MSG = "कृपया आफ्नो सम्पर्क नम्बर दिनुहोस्, हजुरलाई सम्पूर्ण जानकारी हामी कलमार्फत दिन्छौं।";
const DEFAULT_FOLLOWUP_MSG = "धन्यवाद! हामी छिट्टै सम्पर्क गर्नेछौं।";
const DEFAULT_AI_INSTRUCTIONS = `- सधैं Roman Nepali मा reply गर्नुहोस् (customer ले जुन भाषामा लेखे पनि)
- Sales person जस्तो friendly र convincing बोल्नुहोस्
- Customer ले number दिँदा lead मा save गर्नुहोस्
- Nepal को 10 digit mobile number (98/97 बाट शुरु) मात्र valid हो
- Number गलत लागे "सही 10 digit number दिनुहोस्" भन्नुहोस्
- Price सोध्दा direct नभन्नुहोस्, call गर्छौं भन्नुहोस्
- Number माग्दा naturally माग्नुहोस्, force नगर्नुहोस्`;

function parseMessages(data: Json | undefined | null, fallbackText: string): ReplyMessage[] {
  if (Array.isArray(data) && data.length > 0) {
    return (data as any[]).map((m: any) => ({
      text: m.text || "",
      media: m.media || null,
    }));
  }
  return [{ text: fallbackText, media: null }];
}

export function PageAutomationDialog({
  open,
  onOpenChange,
  page,
}: PageAutomationDialogProps) {
  const updateSettings = useUpdatePageSettings();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState("automation");
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiCommentHint, setAiCommentHint] = useState("");
  const [savingAI, setSavingAI] = useState(false);
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [aiFollowupEnabled, setAiFollowupEnabled] = useState(false);
  const [aiFollowupSteps, setAiFollowupSteps] = useState<AiFollowupStep[]>([]);
  const [aiCommentReplyEnabled, setAiCommentReplyEnabled] = useState(false);
  const [debounceSeconds, setDebounceSeconds] = useState(30);
  const [savingProduct, setSavingProduct] = useState(false);
  const [replyMessages, setReplyMessages] = useState<ReplyMessage[]>([{ text: DEFAULT_FIRST_MSG, media: null }]);
  const [followupMessages, setFollowupMessages] = useState<ReplyMessage[]>([{ text: DEFAULT_FOLLOWUP_MSG, media: null }]);
  const [replyIndex, setReplyIndex] = useState(0);
  const [followupIndex, setFollowupIndex] = useState(0);
  const [keywords, setKeywords] = useState<ExtendedAutoReplyKeyword[]>([]);
  const [commentAutoReply, setCommentAutoReply] = useState("");
  
  const [newKeyword, setNewKeyword] = useState("");
  const [newReply, setNewReply] = useState("");
  const [newMediaType, setNewMediaType] = useState<"image" | "video" | "link" | "audio" | null>(null);
  const [newMediaUrl, setNewMediaUrl] = useState("");
  
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editKeyword, setEditKeyword] = useState("");
  const [editReply, setEditReply] = useState("");
  const [editMediaType, setEditMediaType] = useState<"image" | "video" | "link" | "audio" | null>(null);
  const [editMediaUrl, setEditMediaUrl] = useState("");
  
  const [uploadingReply, setUploadingReply] = useState(false);
  const [uploadingFollowup, setUploadingFollowup] = useState(false);
  const [uploadingKeyword, setUploadingKeyword] = useState(false);
  
  const replyMediaRef = useRef<HTMLInputElement>(null);
  const followupMediaRef = useRef<HTMLInputElement>(null);
  const keywordMediaRef = useRef<HTMLInputElement>(null);
  const editMediaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (page && open) {
      setAutomationEnabled(page.automation_enabled || false);
      setReplyIndex(0);
      setFollowupIndex(0);
      setCommentAutoReply((page as any).comment_auto_reply || "");
      
      const pageAny = page as any;
      const replyMsgs = parseMessages(pageAny.auto_reply_messages, "");
      if (replyMsgs.length === 0 || (replyMsgs.length === 1 && !replyMsgs[0].text)) {
        try {
          const old = page.auto_reply_first_message ? JSON.parse(page.auto_reply_first_message) : null;
          if (old && typeof old === 'object' && old.text) {
            setReplyMessages([{ text: old.text, media: old.media || null }]);
          } else {
            setReplyMessages([{ text: page.auto_reply_first_message || DEFAULT_FIRST_MSG, media: null }]);
          }
        } catch {
          setReplyMessages([{ text: page.auto_reply_first_message || DEFAULT_FIRST_MSG, media: null }]);
        }
      } else {
        setReplyMessages(replyMsgs);
      }
      
      const followMsgs = parseMessages(pageAny.auto_followup_messages, "");
      if (followMsgs.length === 0 || (followMsgs.length === 1 && !followMsgs[0].text)) {
        try {
          const old = page.auto_reply_followup ? JSON.parse(page.auto_reply_followup) : null;
          if (old && typeof old === 'object' && old.text) {
            setFollowupMessages([{ text: old.text, media: old.media || null }]);
          } else {
            setFollowupMessages([{ text: page.auto_reply_followup || DEFAULT_FOLLOWUP_MSG, media: null }]);
          }
        } catch {
          setFollowupMessages([{ text: page.auto_reply_followup || DEFAULT_FOLLOWUP_MSG, media: null }]);
        }
      } else {
        setFollowupMessages(followMsgs);
      }
      
      const keywordsData = page.auto_reply_keywords;
      if (Array.isArray(keywordsData) && keywordsData.length > 0) {
        setKeywords(keywordsData.map((k: any) => ({
          keywords: k.keywords || [],
          reply: k.reply || "",
          media: k.media || null,
        })));
      } else {
        setKeywords([]);
      }
      
      setAiEnabled((page as any).ai_enabled || false);
      setAiDescription((page as any).ai_description || "");
      setAiInstructions((page as any).ai_instructions || DEFAULT_AI_INSTRUCTIONS);
      setAiCommentHint((page as any).ai_comment_hint || "");
      setAiCommentReplyEnabled((page as any).ai_comment_reply_enabled || false);
      setDebounceSeconds((page as any).ai_debounce_seconds ?? 30);
      
      // AI Follow-up: load saved steps or start with 1 default
      const followupSettings = (page as any).ai_followup_settings as AiFollowupSettings | null;
      if (followupSettings) {
        setAiFollowupEnabled(followupSettings.enabled || false);
        if (followupSettings.steps && followupSettings.steps.length > 0) {
          setAiFollowupSteps(followupSettings.steps);
        } else {
          setAiFollowupSteps([{ delay_hours: 6, message_hint: "Product को video/photo सहित जानकारी दिनुहोस्", media: null }]);
        }
      } else {
        setAiFollowupEnabled(false);
        setAiFollowupSteps([{ delay_hours: 6, message_hint: "Product को video/photo सहित जानकारी दिनुहोस्", media: null }]);
      }
      
      setProductName((page as any).product_name || "");
      setProductDescription((page as any).product_description || "");
    }
  }, [page, open]);

  const handleToggleAutomation = (checked: boolean) => {
    if (checked && aiEnabled) {
      toast.error("Automation र AI एकसाथ enable गर्न मिल्दैन।");
      return;
    }
    setAutomationEnabled(checked);
  };

  const handleToggleAI = (checked: boolean) => {
    if (checked && automationEnabled) {
      toast.error("Automation र AI एकसाथ enable गर्न मिल्दैन।");
      return;
    }
    setAiEnabled(checked);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${page?.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('automation-media').upload(filePath, file);
      if (uploadError) { toast.error("Image upload गर्न सकिएन"); return null; }
      const { data: { publicUrl } } = supabase.storage.from('automation-media').getPublicUrl(filePath);
      return publicUrl;
    } catch { toast.error("Image upload गर्न सकिएन"); return null; }
  };

  const updateReplyMsg = (index: number, update: Partial<ReplyMessage>) => {
    setReplyMessages(prev => prev.map((m, i) => i === index ? { ...m, ...update } : m));
  };
  const updateFollowupMsg = (index: number, update: Partial<ReplyMessage>) => {
    setFollowupMessages(prev => prev.map((m, i) => i === index ? { ...m, ...update } : m));
  };
  const addReplyStep = () => {
    if (replyMessages.length >= 3) return;
    setReplyMessages(prev => [...prev, { text: "", media: null }]);
    setReplyIndex(replyMessages.length);
  };
  const addFollowupStep = () => {
    if (followupMessages.length >= 3) return;
    setFollowupMessages(prev => [...prev, { text: "", media: null }]);
    setFollowupIndex(followupMessages.length);
  };
  const removeReplyStep = (idx: number) => {
    if (replyMessages.length <= 1) return;
    setReplyMessages(prev => prev.filter((_, i) => i !== idx));
    setReplyIndex(prev => Math.min(prev, replyMessages.length - 2));
  };
  const removeFollowupStep = (idx: number) => {
    if (followupMessages.length <= 1) return;
    setFollowupMessages(prev => prev.filter((_, i) => i !== idx));
    setFollowupIndex(prev => Math.min(prev, followupMessages.length - 2));
  };

  const handleReplyMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingReply(true);
    const url = await uploadImage(file);
    if (url) updateReplyMsg(replyIndex, { media: { type: 'image', url } });
    setUploadingReply(false);
    if (replyMediaRef.current) replyMediaRef.current.value = '';
  };
  const handleFollowupMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingFollowup(true);
    const url = await uploadImage(file);
    if (url) updateFollowupMsg(followupIndex, { media: { type: 'image', url } });
    setUploadingFollowup(false);
    if (followupMediaRef.current) followupMediaRef.current.value = '';
  };
  const handleKeywordMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingKeyword(true);
    const url = await uploadImage(file);
    if (url) { setNewMediaType('image'); setNewMediaUrl(url); }
    setUploadingKeyword(false);
    if (keywordMediaRef.current) keywordMediaRef.current.value = '';
  };
  const handleEditMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingKeyword(true);
    const url = await uploadImage(file);
    if (url) { setEditMediaType('image'); setEditMediaUrl(url); }
    setUploadingKeyword(false);
    if (editMediaRef.current) editMediaRef.current.value = '';
  };

  const handleAddKeyword = () => {
    if (!newKeyword.trim() || !newReply.trim()) { toast.error("Keywords र Reply दुवै भर्नुहोस्"); return; }
    const keywordList = newKeyword.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
    if (keywordList.length === 0) { toast.error("कम्तीमा एउटा keyword राख्नुहोस्"); return; }
    const newRule: ExtendedAutoReplyKeyword = { keywords: keywordList, reply: newReply };
    if (newMediaType && newMediaUrl.trim()) newRule.media = { type: newMediaType, url: newMediaUrl.trim() };
    setKeywords([...keywords, newRule]);
    setNewKeyword(""); setNewReply(""); setNewMediaType(null); setNewMediaUrl("");
  };

  const handleRemoveKeyword = (index: number) => { setKeywords(keywords.filter((_, i) => i !== index)); };
  const startEditKeyword = (index: number) => {
    const rule = keywords[index];
    setEditingIndex(index); setEditKeyword(rule.keywords.join(", ")); setEditReply(rule.reply);
    setEditMediaType(rule.media?.type || null); setEditMediaUrl(rule.media?.url || "");
  };
  const saveEditKeyword = () => {
    if (editingIndex === null) return;
    if (!editKeyword.trim() || !editReply.trim()) { toast.error("Keywords र Reply दुवै भर्नुहोस्"); return; }
    const keywordList = editKeyword.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
    const updatedRule: ExtendedAutoReplyKeyword = { keywords: keywordList, reply: editReply };
    if (editMediaType && editMediaUrl.trim()) updatedRule.media = { type: editMediaType, url: editMediaUrl.trim() };
    const updated = [...keywords]; updated[editingIndex] = updatedRule; setKeywords(updated);
    setEditingIndex(null); setEditKeyword(""); setEditReply(""); setEditMediaType(null); setEditMediaUrl("");
  };
  const cancelEdit = () => { setEditingIndex(null); setEditKeyword(""); setEditReply(""); setEditMediaType(null); setEditMediaUrl(""); };

  // AI Follow-up step management
  const addAiFollowupStep = () => {
    if (aiFollowupSteps.length >= 5) return;
    const defaultDelays = [24, 72, 120, 168];
    const defaultHints = [
      "Special offer/discount बारेमा बताउनुहोस्",
      "के विचार गर्नुभयो? Reminder पठाउनुहोस्",
      "Limited stock/time offer बारेमा बताउनुहोस्",
      "Final follow-up - अन्तिम पटक सम्झाउनुहोस्",
    ];
    const idx = aiFollowupSteps.length - 1;
    setAiFollowupSteps(prev => [...prev, {
      delay_hours: defaultDelays[idx] || 168,
      message_hint: defaultHints[idx] || "Follow-up message",
      media: null,
    }]);
  };

  const removeAiFollowupStep = (idx: number) => {
    if (idx === 0) {
      // Can't remove first step, just clear it
      const updated = [...aiFollowupSteps];
      updated[0] = { delay_hours: 6, message_hint: "", media: null };
      setAiFollowupSteps(updated);
      return;
    }
    setAiFollowupSteps(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!page) return;
    try {
      const keywordsToSave = keywords.map(k => ({ keywords: k.keywords, reply: k.reply, media: k.media || null }));
      const firstMsgCompat = replyMessages[0]?.text || DEFAULT_FIRST_MSG;
      const followupCompat = followupMessages[0]?.text || DEFAULT_FOLLOWUP_MSG;

      await updateSettings.mutateAsync({
        pageId: page.id,
        settings: {
          automation_enabled: automationEnabled,
          auto_reply_first_message: firstMsgCompat,
          auto_reply_followup: followupCompat,
          auto_reply_keywords: keywordsToSave,
        },
        extraData: {
          auto_reply_messages: replyMessages,
          auto_followup_messages: followupMessages,
          comment_auto_reply: commentAutoReply,
        },
      });
      
      if (automationEnabled && aiEnabled) {
        setAiEnabled(false);
        await supabase.from("connected_pages").update({ ai_enabled: false } as any).eq("id", page.id);
      }
      
      toast.success("Automation settings save भयो!");
      onOpenChange(false);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Settings save गर्न सकिएन");
    }
  };

  const handleSaveAI = async () => {
    if (!page) return;
    setSavingAI(true);
    try {
      const updateData: Record<string, any> = {
        ai_enabled: aiEnabled,
        ai_description: aiDescription,
        ai_instructions: aiInstructions,
        ai_comment_hint: aiCommentHint,
        ai_comment_reply_enabled: aiCommentReplyEnabled,
        ai_debounce_seconds: debounceSeconds,
        ai_followup_settings: {
          enabled: aiFollowupEnabled,
          steps: aiFollowupSteps,
        },
      };
      if (aiEnabled && automationEnabled) {
        updateData.automation_enabled = false;
        setAutomationEnabled(false);
      }
      const { error } = await supabase.from("connected_pages").update(updateData as any).eq("id", page.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
      toast.success("AI settings save भयो!");
      onOpenChange(false);
    } catch (error) {
      console.error("AI save error:", error);
      toast.error("AI settings save गर्न सकिएन");
    } finally {
      setSavingAI(false);
    }
  };

  const handleSaveProduct = async () => {
    if (!page) return;
    setSavingProduct(true);
    try {
      const { error } = await supabase.from("connected_pages").update({ product_name: productName, product_description: productDescription } as any).eq("id", page.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
      toast.success("Product settings save भयो!");
    } catch (error) {
      toast.error("Product settings save गर्न सकिएन");
    } finally {
      setSavingProduct(false);
    }
  };

  const MediaButtons = ({ selectedType, onUploadClick, isUploading, onSetMedia }: { 
    selectedType: "image" | "video" | "link" | "audio" | null;
    onUploadClick: () => void;
    isUploading: boolean;
    onSetMedia: (media: MediaAttachment | null) => void;
  }) => (
    <div className="flex gap-2 flex-wrap">
      <Button type="button" variant={selectedType === 'image' ? "default" : "outline"} size="sm" onClick={onUploadClick} disabled={isUploading} className="h-8">
        {isUploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
        Image
      </Button>
      <Button type="button" variant={selectedType === 'video' ? "default" : "outline"} size="sm" onClick={() => onSetMedia(selectedType === 'video' ? null : { type: 'video', url: '' })} className="h-8">
        <Video className="h-3 w-3 mr-1" />Video
      </Button>
      <Button type="button" variant={selectedType === 'audio' ? "default" : "outline"} size="sm" onClick={() => onSetMedia(selectedType === 'audio' ? null : { type: 'audio', url: '' })} className="h-8">
        <FileAudio className="h-3 w-3 mr-1" />Audio
      </Button>
      <Button type="button" variant={selectedType === 'link' ? "default" : "outline"} size="sm" onClick={() => onSetMedia(selectedType === 'link' ? null : { type: 'link', url: '' })} className="h-8">
        <Link2 className="h-3 w-3 mr-1" />Link
      </Button>
    </div>
  );

  const StepNav = ({ current, total, onPrev, onNext, onAdd, onRemove, label }: {
    current: number; total: number; onPrev: () => void; onNext: () => void; onAdd: () => void; onRemove: (i: number) => void; label: string;
  }) => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label} {current + 1}/{total}</span>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className={`h-1.5 w-4 rounded-full transition-colors ${i === current ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onPrev} disabled={current === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onNext} disabled={current >= total - 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {total < 3 && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onAdd} title="Add step">
            <Plus className="h-4 w-4" />
          </Button>
        )}
        {total > 1 && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onRemove(current)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );

  const currentReply = replyMessages[replyIndex] || { text: "", media: null };
  const currentFollowup = followupMessages[followupIndex] || { text: "", media: null };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Page Settings</DialogTitle>
          <DialogDescription>{page?.page_name} को settings configure गर्नुहोस्</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="product">Product</TabsTrigger>
          </TabsList>

          <TabsContent value="automation" className="mt-4">
        <div className="space-y-6">
          {/* Master Toggle */}
          <div className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${automationEnabled ? 'border-green-500/50 bg-green-500/5' : 'border-dashed'}`}>
            <div>
              <Label className="text-base font-medium">Enable Automation</Label>
              <p className="text-sm text-muted-foreground">यस page को auto-replies {automationEnabled ? 'सक्रिय छ' : 'बन्द छ'}</p>
            </div>
            <Switch checked={automationEnabled} onCheckedChange={handleToggleAutomation} />
          </div>

          {/* First Message Auto-Reply (Multi-step) */}
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Message Auto-Reply</Label>
              <p className="text-xs text-muted-foreground">Customer ले message गर्दा क्रमशः reply (३ ओटा सम्म)</p>
            </div>
            <StepNav
              current={replyIndex} total={replyMessages.length}
              onPrev={() => setReplyIndex(i => Math.max(0, i - 1))}
              onNext={() => setReplyIndex(i => Math.min(replyMessages.length - 1, i + 1))}
              onAdd={addReplyStep} onRemove={removeReplyStep} label="Reply"
            />
            <Textarea
              value={currentReply.text}
              onChange={(e) => updateReplyMsg(replyIndex, { text: e.target.value })}
              placeholder={`${replyIndex + 1} नम्बर message auto-reply...`}
              rows={3}
            />
            <input ref={replyMediaRef} type="file" accept="image/*" className="hidden" onChange={handleReplyMediaUpload} />
            {currentReply.media && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                {currentReply.media.type === 'image' && <img src={currentReply.media.url} alt="" className="h-12 w-12 object-cover rounded" />}
                <span className="text-xs text-muted-foreground flex-1 truncate">{currentReply.media.type}: {currentReply.media.url.substring(0, 40)}...</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateReplyMsg(replyIndex, { media: null })}><X className="h-3 w-3" /></Button>
              </div>
            )}
            <MediaButtons
              selectedType={currentReply.media?.type || null}
              onUploadClick={() => replyMediaRef.current?.click()}
              isUploading={uploadingReply}
              onSetMedia={(media) => updateReplyMsg(replyIndex, { media })}
            />
            {currentReply.media && (currentReply.media.type === 'video' || currentReply.media.type === 'link' || currentReply.media.type === 'audio') && (
              <Input placeholder={`${currentReply.media.type === 'video' ? 'Video' : currentReply.media.type === 'audio' ? 'Audio' : 'Link'} URL...`} value={currentReply.media.url} onChange={(e) => updateReplyMsg(replyIndex, { media: { ...currentReply.media!, url: e.target.value } })} />
            )}
          </div>

          {/* Follow-up Auto-Reply (Multi-step) */}
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Follow-up Auto-Reply</Label>
              <p className="text-xs text-muted-foreground">Follow-up messages क्रमशः (३ ओटा सम्म)</p>
            </div>
            <StepNav
              current={followupIndex} total={followupMessages.length}
              onPrev={() => setFollowupIndex(i => Math.max(0, i - 1))}
              onNext={() => setFollowupIndex(i => Math.min(followupMessages.length - 1, i + 1))}
              onAdd={addFollowupStep} onRemove={removeFollowupStep} label="Follow-up"
            />
            <Textarea
              value={currentFollowup.text}
              onChange={(e) => updateFollowupMsg(followupIndex, { text: e.target.value })}
              placeholder={`${followupIndex + 1} नम्बर follow-up message...`}
              rows={3}
            />
            <input ref={followupMediaRef} type="file" accept="image/*" className="hidden" onChange={handleFollowupMediaUpload} />
            {currentFollowup.media && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                {currentFollowup.media.type === 'image' && <img src={currentFollowup.media.url} alt="" className="h-12 w-12 object-cover rounded" />}
                <span className="text-xs text-muted-foreground flex-1 truncate">{currentFollowup.media.type}: {currentFollowup.media.url.substring(0, 40)}...</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateFollowupMsg(followupIndex, { media: null })}><X className="h-3 w-3" /></Button>
              </div>
            )}
            <MediaButtons
              selectedType={currentFollowup.media?.type || null}
              onUploadClick={() => followupMediaRef.current?.click()}
              isUploading={uploadingFollowup}
              onSetMedia={(media) => updateFollowupMsg(followupIndex, { media })}
            />
            {currentFollowup.media && (currentFollowup.media.type === 'video' || currentFollowup.media.type === 'link' || currentFollowup.media.type === 'audio') && (
              <Input placeholder={`${currentFollowup.media.type === 'video' ? 'Video' : currentFollowup.media.type === 'audio' ? 'Audio' : 'Link'} URL...`} value={currentFollowup.media.url} onChange={(e) => updateFollowupMsg(followupIndex, { media: { ...currentFollowup.media!, url: e.target.value } })} />
            )}
          </div>

          {/* Comment Auto-Reply */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">Comment Auto-Reply</Label>
                <p className="text-xs text-muted-foreground">Post मा comment आउँदा auto reply (खाली छोड्नुभयो भने reply जाँदैन)</p>
              </div>
            </div>
            <Textarea
              value={commentAutoReply}
              onChange={(e) => setCommentAutoReply(e.target.value)}
              placeholder="Example: धन्यवाद! कृपया हाम्रो inbox मा message गर्नुहोस् विस्तृत जानकारीको लागि।"
              rows={3}
            />
          </div>

          {/* Keyword-based Replies */}
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="text-sm font-medium">Keyword Auto-Replies</Label>
            <p className="text-xs text-muted-foreground">Message मा keywords आउँदा reply पठाउने</p>

            {keywords.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {keywords.map((rule, index) => (
                  <div key={index}>
                    {editingIndex === index ? (
                      <div className="space-y-2 rounded-lg border-2 border-primary p-3">
                        <Input value={editKeyword} onChange={(e) => setEditKeyword(e.target.value)} placeholder="Keywords (comma separated)" />
                        <Textarea value={editReply} onChange={(e) => setEditReply(e.target.value)} placeholder="Reply message..." rows={2} />
                        <input ref={editMediaRef} type="file" accept="image/*" className="hidden" onChange={handleEditMediaUpload} />
                        {editMediaUrl && (
                          <div className="flex items-center gap-2 p-2 bg-muted rounded">
                            {editMediaType === 'image' && <img src={editMediaUrl} alt="" className="h-10 w-10 object-cover rounded" />}
                            <span className="text-xs flex-1 truncate">{editMediaUrl.substring(0, 30)}...</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditMediaType(null); setEditMediaUrl(""); }}><X className="h-3 w-3" /></Button>
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => editMediaRef.current?.click()} disabled={uploadingKeyword}>
                            {uploadingKeyword ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}Image
                          </Button>
                          <Button size="sm" variant={editMediaType === 'video' ? "default" : "outline"} onClick={() => { setEditMediaType('video'); setEditMediaUrl(''); }}>
                            <Video className="h-3 w-3 mr-1" />Video
                          </Button>
                          <Button size="sm" variant={editMediaType === 'audio' ? "default" : "outline"} onClick={() => { setEditMediaType('audio'); setEditMediaUrl(''); }}>
                            <FileAudio className="h-3 w-3 mr-1" />Audio
                          </Button>
                          <Button size="sm" variant={editMediaType === 'link' ? "default" : "outline"} onClick={() => { setEditMediaType('link'); setEditMediaUrl(''); }}>
                            <Link2 className="h-3 w-3 mr-1" />Link
                          </Button>
                        </div>
                        {editMediaType && editMediaType !== 'image' && (
                          <Input value={editMediaUrl} onChange={(e) => setEditMediaUrl(e.target.value)} placeholder={`${editMediaType === 'video' ? 'Video' : editMediaType === 'audio' ? 'Audio' : 'Link'} URL...`} />
                        )}
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" onClick={saveEditKeyword}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 rounded-lg border p-3 bg-background">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{rule.keywords.join(", ")}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rule.reply}</p>
                          {rule.media && (
                            <div className="flex items-center gap-2 mt-1">
                              {rule.media.type === 'image' && <img src={rule.media.url} alt="" className="h-8 w-8 object-cover rounded" />}
                              <span className="text-xs text-blue-500">📎 {rule.media.type}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditKeyword(index)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRemoveKeyword(index)}><Trash2 className="h-4 w-4" /></Button>
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
              <Input placeholder="Keywords (comma separated): price, cost, rate" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} />
              <Textarea placeholder="Auto-reply message..." value={newReply} onChange={(e) => setNewReply(e.target.value)} rows={2} />
              <input ref={keywordMediaRef} type="file" accept="image/*" className="hidden" onChange={handleKeywordMediaUpload} />
              {newMediaUrl && (
                <div className="flex items-center gap-2 p-2 bg-background rounded">
                  {newMediaType === 'image' && <img src={newMediaUrl} alt="" className="h-10 w-10 object-cover rounded" />}
                  <span className="text-xs flex-1 truncate">{newMediaUrl.substring(0, 30)}...</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setNewMediaType(null); setNewMediaUrl(""); }}><X className="h-3 w-3" /></Button>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button type="button" size="sm" variant="outline" onClick={() => keywordMediaRef.current?.click()} disabled={uploadingKeyword}>
                  {uploadingKeyword ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}Image
                </Button>
                <Button type="button" variant={newMediaType === 'video' ? "default" : "outline"} size="sm" onClick={() => { setNewMediaType(newMediaType === 'video' ? null : 'video'); setNewMediaUrl(''); }}>
                  <Video className="h-3 w-3 mr-1" />Video
                </Button>
                <Button type="button" variant={newMediaType === 'audio' ? "default" : "outline"} size="sm" onClick={() => { setNewMediaType(newMediaType === 'audio' ? null : 'audio'); setNewMediaUrl(''); }}>
                  <FileAudio className="h-3 w-3 mr-1" />Audio
                </Button>
                <Button type="button" variant={newMediaType === 'link' ? "default" : "outline"} size="sm" onClick={() => { setNewMediaType(newMediaType === 'link' ? null : 'link'); setNewMediaUrl(''); }}>
                  <Link2 className="h-3 w-3 mr-1" />Link
                </Button>
              </div>
              {newMediaType && newMediaType !== 'image' && (
                <Input placeholder={`${newMediaType === 'video' ? 'Video' : newMediaType === 'audio' ? 'Audio' : 'Link'} URL...`} value={newMediaUrl} onChange={(e) => setNewMediaUrl(e.target.value)} />
              )}
              <Button type="button" variant="outline" size="sm" onClick={handleAddKeyword} className="w-full">
                <Plus className="mr-2 h-4 w-4" />Keyword Rule थप्नुहोस्
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Automation
          </Button>
        </div>
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <div className="space-y-6">
              <div className={`rounded-lg border-2 p-4 transition-colors ${aiEnabled ? 'border-primary/50 bg-primary/5' : 'border-dashed'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-medium">Enable AI</Label>
                    <p className="text-sm text-muted-foreground">AI ले यस page को business बुझेर reply गर्छ</p>
                  </div>
                  <Switch checked={aiEnabled} onCheckedChange={handleToggleAI} />
                </div>
                {aiEnabled && (
                  <div className="mt-3 pt-3 border-t flex items-center gap-3">
                    <Label className="text-sm whitespace-nowrap">Hold Time:</Label>
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      value={debounceSeconds}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setDebounceSeconds(0 as any);
                          return;
                        }
                        const num = parseInt(val);
                        if (!isNaN(num)) setDebounceSeconds(num);
                      }}
                      onBlur={() => {
                        if (!debounceSeconds || debounceSeconds < 5) setDebounceSeconds(5);
                        if (debounceSeconds > 120) setDebounceSeconds(120);
                      }}
                      className="w-20 h-8"
                    />
                    <span className="text-xs text-muted-foreground">sec (message combine गर्न)</span>
                  </div>
                )}
              </div>

              {/* AI Comment Reply Toggle */}
              <div className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${aiCommentReplyEnabled ? 'border-blue-500/50 bg-blue-500/5' : 'border-dashed'}`}>
                <div>
                  <Label className="text-sm font-medium">AI Comment Reply</Label>
                  <p className="text-xs text-muted-foreground">Post मा नयाँ comment आउँदा AI ले auto-reply गर्छ</p>
                </div>
                <Switch checked={aiCommentReplyEnabled} onCheckedChange={setAiCommentReplyEnabled} />
              </div>

              {/* AI Comment Hint */}
              {aiCommentReplyEnabled && (
                <div className="space-y-3 rounded-lg border p-4">
                  <div>
                    <Label className="text-sm font-medium">Comment Reply Hint</Label>
                    <p className="text-xs text-muted-foreground">AI comment reply कस्तो हुनुपर्छ भन्ने hint</p>
                  </div>
                  <Textarea
                    value={aiCommentHint}
                    onChange={(e) => setAiCommentHint(e.target.value)}
                    placeholder="eg: Comment मा inbox मा message गर्न भन्नुहोस्, price नभन्नुहोस्, exact format: 'धन्यवाद! कृपया inbox मा message गर्नुहोस्'"
                    rows={3}
                    className="resize-y min-h-[60px]"
                  />
                </div>
              )}

              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <Label className="text-sm font-medium">Business Description</Label>
                  <p className="text-xs text-muted-foreground">तपाईंको business बारेमा AI लाई सिकाउनुहोस्</p>
                </div>
                <Textarea
                  value={aiDescription}
                  onChange={(e) => setAiDescription(e.target.value)}
                  placeholder={`Example:\n- हामी car accessories बेच्छौं\n- Location: काठमाडौं\n- Products: seat cover (Rs 2000-5000)\n- Delivery: काठमाडौं भित्र free\n- Payment: Cash on delivery, eSewa\n- Contact: 98XXXXXXXX`}
                  rows={6}
                  className="resize-y min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">जति detail दिनुहुन्छ, AI ले त्यति राम्रो reply गर्छ</p>
              </div>

              {/* AI Instructions */}
              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <Label className="text-sm font-medium">Instructions for AI</Label>
                  <p className="text-xs text-muted-foreground">AI लाई कसरी reply गर्ने भन्ने instructions दिनुहोस्</p>
                </div>
                <Textarea
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  placeholder={`Example:\n- Human mode मा reply गर्नुहोस्\n- 😊🙏 emoji प्रयोग गर्नुहोस्\n- Nepali/Roman Nepali मा reply गर्नुहोस्\n- Sales person जस्तो बोल्नुहोस्\n- AI को नाम "Maya" राख्नुहोस्\n- Price सोध्दा direct नभन्नुहोस्, inbox मा भन्नुहोस्`}
                  rows={8}
                  className="resize-y min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground">AI ले यी instructions follow गरेर reply गर्छ</p>
              </div>

              {/* AI Follow-up Schedule */}
              <div className="space-y-4 rounded-lg border p-4">
                <div className={`flex items-center justify-between rounded-lg border-2 p-3 transition-colors ${aiFollowupEnabled ? 'border-blue-500/50 bg-blue-500/5' : 'border-dashed'}`}>
                  <div>
                    <Label className="text-sm font-medium">AI Follow-up</Label>
                    <p className="text-xs text-muted-foreground">Number नदिने/order confirm नगर्ने लाई AI ले follow-up गर्छ</p>
                  </div>
                  <Switch checked={aiFollowupEnabled} onCheckedChange={setAiFollowupEnabled} />
                </div>

                {aiFollowupEnabled && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">Follow-up steps configure गर्नुहोस् (५ ओटा सम्म)। AI ले यी hints अनुसार message generate गर्छ।</p>
                    {aiFollowupSteps.map((step, idx) => (
                      <div key={idx} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Follow-up #{idx + 1}</span>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">पछि (hours):</Label>
                            <Input
                              type="number"
                              min={1}
                              className="w-20 h-7 text-xs"
                              value={step.delay_hours}
                              onChange={(e) => {
                                const updated = [...aiFollowupSteps];
                                updated[idx] = { ...updated[idx], delay_hours: parseInt(e.target.value) || 1 };
                                setAiFollowupSteps(updated);
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeAiFollowupStep(idx)}
                              title={idx === 0 ? "Clear step" : "Remove step"}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <Input
                          value={step.message_hint}
                          onChange={(e) => {
                            const updated = [...aiFollowupSteps];
                            updated[idx] = { ...updated[idx], message_hint: e.target.value };
                            setAiFollowupSteps(updated);
                          }}
                          placeholder="AI लाई के बारेमा message गर्ने hint दिनुहोस्..."
                          className="text-xs"
                        />
                        <div className="space-y-2">
                          <div className="flex gap-2 items-center">
                            <Input
                              value={step.media?.url || ""}
                              onChange={(e) => {
                                const updated = [...aiFollowupSteps];
                                updated[idx] = { ...updated[idx], media: e.target.value ? { type: "link", url: e.target.value } : null };
                                setAiFollowupSteps(updated);
                              }}
                              placeholder="Video/Link URL (optional)"
                              className="text-xs flex-1"
                            />
                            {step.media?.url && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                const updated = [...aiFollowupSteps];
                                updated[idx] = { ...updated[idx], media: null };
                                setAiFollowupSteps(updated);
                              }}><X className="h-3 w-3" /></Button>
                            )}
                          </div>
                          <Input
                            value={(step as any).fb_video_embed || ""}
                            onChange={(e) => {
                              const updated = [...aiFollowupSteps];
                              (updated[idx] as any) = { ...updated[idx], fb_video_embed: e.target.value || undefined };
                              setAiFollowupSteps(updated);
                            }}
                            placeholder="Facebook Video Embed URL (optional) - fb.watch/..."
                            className="text-xs"
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {step.delay_hours < 24
                            ? `${step.delay_hours} घण्टा पछि`
                            : `${Math.round(step.delay_hours / 24)} दिन पछि`} follow-up जान्छ
                        </p>
                      </div>
                    ))}
                    {aiFollowupSteps.length < 5 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addAiFollowupStep}
                        className="w-full"
                      >
                        <Plus className="mr-2 h-4 w-4" />Follow-up Step थप्नुहोस्
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSaveAI} disabled={savingAI}>
                {savingAI && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save AI Settings
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="product" className="mt-4">
            <div className="space-y-6">
              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <Label className="text-sm font-medium">Product Name</Label>
                  <p className="text-xs text-muted-foreground">यस page को main product/service को नाम</p>
                </div>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g., Car Scratches, Seat Covers, Mobile Accessories"
                />
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <Label className="text-sm font-medium">Product Description</Label>
                  <p className="text-xs text-muted-foreground">Product बारेमा थप जानकारी</p>
                </div>
                <Textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="Product को details, pricing, features, etc."
                  rows={5}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                यो product name lead create हुँदा automatically lead मा save हुन्छ।
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSaveProduct} disabled={savingProduct}>
                {savingProduct && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Product
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
