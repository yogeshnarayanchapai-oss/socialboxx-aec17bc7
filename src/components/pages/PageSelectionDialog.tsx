import { useState, useMemo } from "react";
import { Loader2, Facebook, Check, Search, AlertCircle } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FacebookPage, useConnectMultiplePages } from "@/hooks/useFacebookPages";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PageSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: FacebookPage[];
  onSuccess: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function PageSelectionDialog({
  open,
  onOpenChange,
  pages,
  onSuccess,
  isLoading = false,
  error = null,
}: PageSelectionDialogProps) {
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const connectPages = useConnectMultiplePages();

  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return pages;
    const query = searchQuery.toLowerCase();
    return pages.filter((page) =>
      page.name.toLowerCase().includes(query) || page.id.includes(query)
    );
  }, [pages, searchQuery]);

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
    if (selectedPageIds.size === filteredPages.length) {
      // Deselect all if all are selected
      setSelectedPageIds(new Set());
    } else {
      // Select all filtered pages
      setSelectedPageIds(new Set(filteredPages.map((p) => p.id)));
    }
  };

  const handleConnect = async () => {
    if (selectedPageIds.size === 0) {
      toast.error("Please select at least one page");
      return;
    }

    const selectedPages = pages.filter((p) => selectedPageIds.has(p.id));

    try {
      const result = await connectPages.mutateAsync(selectedPages);
      
      if (result.results.length > 0) {
        toast.success(`${result.results.length} page(s) connected successfully!`);
      }
      
      setSelectedPageIds(new Set());
      setSearchQuery("");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect pages");
    }
  };

  const handleClose = () => {
    setSelectedPageIds(new Set());
    setSearchQuery("");
    onOpenChange(false);
  };

  const allFilteredSelected = filteredPages.length > 0 && 
    filteredPages.every((p) => selectedPageIds.has(p.id));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="h-5 w-5 text-[#1877F2]" />
            Select Pages to Connect
          </DialogTitle>
          <DialogDescription>
            Choose which Facebook Pages you want to manage in SocialBox
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Loading your pages...</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Facebook className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">
              No Facebook Pages found for your account.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Make sure you're an admin of at least one Facebook Page.
            </p>
          </div>
        ) : (
          <>
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Select All */}
            <div
              onClick={selectAll}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                allFilteredSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={selectAll}
              />
              <span className="font-medium">
                {allFilteredSelected ? "Deselect All" : "Select All"} ({filteredPages.length})
              </span>
            </div>

            {/* Pages List */}
            <div className="max-h-[280px] overflow-y-auto space-y-2">
              {filteredPages.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No pages match your search
                </p>
              ) : (
                filteredPages.map((page) => (
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
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10 overflow-hidden">
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
                ))
              )}
            </div>
          </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleClose}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={connectPages.isPending || selectedPageIds.size === 0 || isLoading}
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
