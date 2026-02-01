import { useState } from "react";
import { Loader2, Facebook, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { FacebookPage, useConnectMultiplePages } from "@/hooks/useFacebookPages";
import { toast } from "sonner";

interface PageSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: FacebookPage[];
  onSuccess: () => void;
}

export function PageSelectionDialog({
  open,
  onOpenChange,
  pages,
  onSuccess,
}: PageSelectionDialogProps) {
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const connectPages = useConnectMultiplePages();

  const togglePage = (pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPageIds(new Set(pages.map((p) => p.id)));
  };

  const handleConnect = async () => {
    if (selectedPageIds.size === 0) {
      toast.error("Please select at least one page");
      return;
    }

    const selectedPages = pages.filter((p) => selectedPageIds.has(p.id));

    try {
      await connectPages.mutateAsync(selectedPages);
      toast.success(`${selectedPages.length} page(s) connected successfully!`);
      setSelectedPageIds(new Set());
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect pages");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Pages to Connect</DialogTitle>
          <DialogDescription>
            Choose which Facebook Pages you want to manage in SocialBox
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[300px] overflow-y-auto space-y-2 py-4">
          {pages.map((page) => (
            <div
              key={page.id}
              onClick={() => togglePage(page.id)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                selectedPageIds.has(page.id)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <Checkbox
                checked={selectedPageIds.has(page.id)}
                onCheckedChange={() => togglePage(page.id)}
              />
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10">
                {page.picture?.data?.url ? (
                  <img
                    src={page.picture.data.url}
                    alt={page.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <Facebook className="h-5 w-5 text-[#1877F2]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{page.name}</p>
                <p className="text-xs text-muted-foreground">ID: {page.id}</p>
              </div>
              {selectedPageIds.has(page.id) && (
                <Check className="h-5 w-5 text-primary flex-shrink-0" />
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={selectAll}
            disabled={selectedPageIds.size === pages.length}
            className="w-full sm:w-auto"
          >
            Select All
          </Button>
          <Button
            onClick={handleConnect}
            disabled={connectPages.isPending || selectedPageIds.size === 0}
            className="w-full sm:w-auto"
          >
            {connectPages.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect Selected ({selectedPageIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
