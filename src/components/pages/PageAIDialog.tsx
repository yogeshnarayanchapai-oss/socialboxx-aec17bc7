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
import { Loader2, Bot, ImagePlus, Music, Video, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface MediaAsset {
  type: "image" | "audio" | "video";
  url: string;
  label: string;
  created_at: string;
}

interface PageAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: {
    id: string;
    page_name: string;
    ai_enabled?: boolean;
    ai_description?: string;
    ai_debounce_seconds?: number;
    automation_enabled?: boolean;
  } | null;
}

export function PageAIDialog({ open, onOpenChange, page }: PageAIDialogProps) {
  const queryClient = useQueryClient();
  const [aiEnabled, setAiEnabled] = useState(false);
  const [description, setDescription] = useState("");
  const [debounceSeconds, setDebounceSeconds] = useState(30);
  const [saving, setSaving] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoLabel, setVideoLabel] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (page && open) {
      setAiEnabled((page as any).ai_enabled || false);
      setDescription((page as any).ai_description || "");
      setDebounceSeconds((page as any).ai_debounce_seconds ?? 30);
      // Load existing media assets
      const assets = (page as any).ai_media_assets;
      if (Array.isArray(assets)) {
        setMediaAssets(assets);
      } else {
        setMediaAssets([]);
      }
    }
  }, [page, open]);

  const handleToggleAI = (checked: boolean) => {
    if (checked && (page as any)?.automation_enabled) {
      toast.error("Automation and AI cannot be enabled together. This may cause message conflicts.");
      return;
    }
    setAiEnabled(checked);
  };

  const handleFileUpload = async (files: FileList | null, type: "image" | "audio") => {
    if (!files || files.length === 0 || !page) return;
    setUploading(true);

    try {
      const newAssets: MediaAsset[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "bin";
        const filePath = `${page.id}/${type}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("automation-media")
          .upload(filePath, file, { contentType: file.type });

        if (uploadError) {
          toast.error(`Upload failed: ${file.name}`);
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data: publicUrl } = supabase.storage
          .from("automation-media")
          .getPublicUrl(filePath);

        newAssets.push({
          type,
          url: publicUrl.publicUrl,
          label: file.name.replace(/\.[^.]+$/, ""),
          created_at: new Date().toISOString(),
        });
      }

      if (newAssets.length > 0) {
        setMediaAssets((prev) => [...prev, ...newAssets]);
        toast.success(`${newAssets.length} ${type} upload भयो!`);
      }
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Upload गर्न सकिएन");
    } finally {
      setUploading(false);
    }
  };

  const handleAddVideo = () => {
    if (!videoUrl.trim()) return;
    const newAsset: MediaAsset = {
      type: "video",
      url: videoUrl.trim(),
      label: videoLabel.trim() || "Video",
      created_at: new Date().toISOString(),
    };
    setMediaAssets((prev) => [...prev, newAsset]);
    setVideoUrl("");
    setVideoLabel("");
    toast.success("Video link add भयो!");
  };

  const handleRemoveAsset = (index: number) => {
    setMediaAssets((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const updateData: Record<string, any> = {
        ai_enabled: aiEnabled,
        ai_description: description,
        ai_debounce_seconds: debounceSeconds,
        ai_media_assets: mediaAssets,
      };

      if (aiEnabled && (page as any)?.automation_enabled) {
        updateData.automation_enabled = false;
      }

      const { error } = await supabase
        .from("connected_pages")
        .update(updateData as any)
        .eq("id", page.id);

      if (error) throw error;

      // Compile and cache AI prompt for this page
      try {
        await supabase.functions.invoke("compile-ai-prompt", {
          body: { pageId: page.id },
        });
        console.log("AI prompt cache compiled successfully");
      } catch (cacheErr) {
        console.warn("Failed to compile AI prompt cache (non-blocking):", cacheErr);
      }

      queryClient.invalidateQueries({ queryKey: ["connected-pages"] });
      toast.success("AI settings save भयो!");
      onOpenChange(false);
    } catch (error) {
      console.error("AI save error:", error);
      toast.error("AI settings save गर्न सकिएन");
    } finally {
      setSaving(false);
    }
  };

  const imageAssets = mediaAssets.filter((a) => a.type === "image");
  const audioAssets = mediaAssets.filter((a) => a.type === "audio");
  const videoAssets = mediaAssets.filter((a) => a.type === "video");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Settings
          </DialogTitle>
          <DialogDescription>
            {page?.page_name} को लागि AI configure गर्नुहोस्
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* AI Toggle */}
          <div className={`rounded-lg border-2 p-4 transition-colors ${
            aiEnabled ? 'border-green-500/50 bg-green-500/5' : 'border-dashed'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Enable AI</Label>
                <p className="text-sm text-muted-foreground">
                  AI ले यस page को business बुझेर reply गर्छ
                </p>
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
                  onChange={(e) => setDebounceSeconds(Math.max(5, Math.min(120, parseInt(e.target.value) || 30)))}
                  className="w-20 h-8"
                />
                <span className="text-xs text-muted-foreground">sec (message combine गर्न)</span>
              </div>
            )}
          </div>

          {/* Business Description */}
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Business Description</Label>
              <p className="text-xs text-muted-foreground">
                तपाईंको business बारेमा AI लाई सिकाउनुहोस् - products, services, pricing, FAQs, etc.
              </p>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Example:\n- हामी car accessories बेच्छौं\n- Location: काठमाडौं\n- Products: seat cover (Rs 2000-5000), floor mat (Rs 1500-3000)\n- Delivery: काठमाडौं भित्र free, बाहिर Rs 200\n- Payment: Cash on delivery, eSewa, bank transfer\n- Working hours: 10AM - 7PM\n- Contact: 98XXXXXXXX`}
              rows={10}
            />
            <p className="text-xs text-muted-foreground">
              जति detail दिनुहुन्छ, AI ले त्यति राम्रो reply गर्छ
            </p>
          </div>

          {/* Media Assets Section */}
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <Label className="text-sm font-medium">Media Assets (Photos, Audio, Videos)</Label>
              <p className="text-xs text-muted-foreground">
                Customer ले photo/video माग्दा AI ले यहाँबाट पठाउँछ
              </p>
            </div>

            {/* Photos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <ImagePlus className="h-3.5 w-3.5" /> Photos
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={uploading}
                  onClick={() => imageInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Upload
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files, "image")}
                />
              </div>
              {imageAssets.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {imageAssets.map((asset, i) => {
                    const globalIdx = mediaAssets.findIndex((a) => a === asset);
                    return (
                      <div key={i} className="relative group rounded-md overflow-hidden border">
                        <img src={asset.url} alt={asset.label} className="w-full h-20 object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => handleRemoveAsset(globalIdx)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-[10px] truncate px-1 py-0.5 bg-muted">{asset.label}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {imageAssets.length === 0 && (
                <p className="text-xs text-muted-foreground italic">कुनै photo upload गरिएको छैन</p>
              )}
            </div>

            {/* Audio */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Music className="h-3.5 w-3.5" /> Audio
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={uploading}
                  onClick={() => audioInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Upload
                </Button>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files, "audio")}
                />
              </div>
              {audioAssets.length > 0 && (
                <div className="space-y-1.5">
                  {audioAssets.map((asset, i) => {
                    const globalIdx = mediaAssets.findIndex((a) => a === asset);
                    return (
                      <div key={i} className="flex items-center gap-2 p-2 rounded border bg-muted/50">
                        <Music className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs truncate flex-1">{asset.label}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => handleRemoveAsset(globalIdx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {audioAssets.length === 0 && (
                <p className="text-xs text-muted-foreground italic">कुनै audio upload गरिएको छैन</p>
              )}
            </div>

            {/* Videos (embed URL) */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5" /> Videos (URL / Link)
              </Label>
              {videoAssets.length > 0 && (
                <div className="space-y-1.5">
                  {videoAssets.map((asset, i) => {
                    const globalIdx = mediaAssets.findIndex((a) => a === asset);
                    return (
                      <div key={i} className="flex items-center gap-2 p-2 rounded border bg-muted/50">
                        <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{asset.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{asset.url}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => handleRemoveAsset(globalIdx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={videoLabel}
                  onChange={(e) => setVideoLabel(e.target.value)}
                  placeholder="Label (e.g. Product Demo)"
                  className="h-8 text-xs flex-1"
                />
                <Input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="Video URL"
                  className="h-8 text-xs flex-[2]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  onClick={handleAddVideo}
                  disabled={!videoUrl.trim()}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {videoAssets.length === 0 && (
                <p className="text-xs text-muted-foreground italic">कुनै video link add गरिएको छैन</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save AI Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
