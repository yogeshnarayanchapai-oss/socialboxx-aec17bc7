import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Bot } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";

interface PageAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: {
    id: string;
    page_name: string;
    ai_enabled?: boolean;
    ai_description?: string;
  } | null;
}

export function PageAIDialog({ open, onOpenChange, page }: PageAIDialogProps) {
  const queryClient = useQueryClient();
  const [aiEnabled, setAiEnabled] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (page && open) {
      setAiEnabled((page as any).ai_enabled || false);
      setDescription((page as any).ai_description || "");
    }
  }, [page, open]);

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("connected_pages")
        .update({
          ai_enabled: aiEnabled,
          ai_description: description,
        } as any)
        .eq("id", page.id);

      if (error) throw error;
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
          <div className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${
            aiEnabled ? 'border-green-500/50 bg-green-500/5' : 'border-dashed'
          }`}>
            <div>
              <Label className="text-base font-medium">Enable AI</Label>
              <p className="text-sm text-muted-foreground">
                AI ले यस page को business बुझेर reply गर्छ
              </p>
            </div>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
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
