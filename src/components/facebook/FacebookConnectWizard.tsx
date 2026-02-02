import { useState } from "react";
import {
  Facebook,
  Check,
  Loader2,
  AlertCircle,
  Search,
  ChevronRight,
  RefreshCw,
  Shield,
  MessageCircle,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useFacebookOAuth, FacebookPage } from "@/hooks/useFacebookOAuth";

interface FacebookConnectWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function FacebookConnectWizard({
  open,
  onOpenChange,
  onSuccess,
}: FacebookConnectWizardProps) {
  const {
    step,
    pages,
    error,
    selectedPageIds,
    isConnecting,
    startOAuth,
    togglePageSelection,
    selectAllPages,
    connectPages,
    reset,
    retryAfterError,
  } = useFacebookOAuth();

  const [searchQuery, setSearchQuery] = useState("");

  const filteredPages = pages.filter(
    (page) =>
      page.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.id.includes(searchQuery)
  );

  const handleClose = () => {
    reset();
    setSearchQuery("");
    onOpenChange(false);
  };

  const handleConnect = () => {
    connectPages();
  };

  const handleSuccess = () => {
    onSuccess?.();
    handleClose();
  };

  const allSelected = filteredPages.length > 0 && filteredPages.every((p) => selectedPageIds.has(p.id));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="h-5 w-5 text-primary" />
            Connect Facebook Page
          </DialogTitle>
          <DialogDescription>
            Connect your Facebook Pages to manage messages and automate replies
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 py-2">
          <StepIndicator
            step={1}
            label="Connect"
            active={step === "idle" || step === "connecting"}
            completed={step !== "idle" && step !== "connecting" && step !== "error"}
          />
          <div className="h-px flex-1 bg-border" />
          <StepIndicator
            step={2}
            label="Select Pages"
            active={step === "loading_pages" || step === "select_pages"}
            completed={step === "confirming" || step === "success"}
          />
          <div className="h-px flex-1 bg-border" />
          <StepIndicator
            step={3}
            label="Done"
            active={step === "confirming"}
            completed={step === "success"}
          />
        </div>

        {/* Error State */}
        {step === "error" && error && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button onClick={retryAfterError} className="flex-1">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Connect with Facebook */}
        {step === "idle" && (
          <div className="space-y-4">
            {/* Features List */}
            <div className="rounded-lg border border-dashed p-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                What you'll get:
              </p>
              <div className="space-y-2">
                <FeatureItem icon={Shield} text="Secure token management (never expires)" />
                <FeatureItem icon={MessageCircle} text="Receive & reply to messages" />
                <FeatureItem icon={Webhook} text="Real-time webhook notifications" />
              </div>
            </div>

            {/* Permissions Notice */}
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Permissions requested:</strong> We'll ask for access to your
                Pages to read messages, manage metadata, and send replies.
                {" "}
                <span className="text-warning">
                  Note: Messaging requires Meta approval.
                </span>
              </p>
            </div>

            <Button
              onClick={startOAuth}
              className="w-full"
              size="lg"
            >
              <Facebook className="mr-2 h-5 w-5" />
              Connect with Facebook
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Connecting State */}
        {step === "connecting" && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Facebook className="h-8 w-8 text-primary" />
              </div>
              <Loader2 className="absolute -bottom-1 -right-1 h-6 w-6 animate-spin text-primary" />
            </div>
            <p className="mt-4 text-sm font-medium">Redirecting to Facebook...</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete the login in the popup window
            </p>
          </div>
        )}

        {/* Loading Pages */}
        {step === "loading_pages" && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm font-medium">Loading your pages...</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fetching pages from Facebook
            </p>
          </div>
        )}

        {/* Step 2: Select Pages */}
        {step === "select_pages" && (
          <div className="space-y-4">
            {/* Search */}
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
              onClick={selectAllPages}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                allSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              )}
            >
              <Checkbox checked={allSelected} />
              <span className="font-medium">
                {allSelected ? "Deselect All" : "Select All"} ({filteredPages.length})
              </span>
            </div>

            {/* Pages List */}
            <div className="max-h-[280px] overflow-y-auto space-y-2">
              {filteredPages.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {searchQuery ? "No pages match your search" : "No pages found"}
                </p>
              ) : (
                filteredPages.map((page) => (
                  <PageItem
                    key={page.id}
                    page={page}
                    selected={selectedPageIds.has(page.id)}
                    onToggle={() => togglePageSelection(page.id)}
                  />
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleConnect}
                disabled={selectedPageIds.size === 0 || isConnecting}
                className="flex-1"
              >
                {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect ({selectedPageIds.size})
              </Button>
            </div>
          </div>
        )}

        {/* Confirming State */}
        {step === "confirming" && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm font-medium">Connecting pages...</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Setting up webhooks and storing tokens securely
            </p>
          </div>
        )}

        {/* Success State */}
        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <p className="mt-4 text-lg font-medium">Pages Connected!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your pages are now ready to receive messages
            </p>
            <Button onClick={handleSuccess} className="mt-6">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Helper Components
function StepIndicator({
  step,
  label,
  active,
  completed,
}: {
  step: number;
  label: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
          completed
            ? "bg-primary text-primary-foreground"
            : active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {completed ? <Check className="h-4 w-4" /> : step}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function FeatureItem({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
      <Icon className="h-4 w-4" />
      <span>{text}</span>
    </div>
  );
}

function PageItem({
  page,
  selected,
  onToggle,
}: {
  page: FacebookPage;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
      )}
    >
      <Checkbox checked={selected} />
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden">
        {page.pictureUrl ? (
          <img
            src={page.pictureUrl}
            alt={page.name}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <Facebook className="h-5 w-5 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{page.name}</p>
        <p className="text-xs text-muted-foreground">ID: {page.id}</p>
      </div>
      {selected && <Check className="h-5 w-5 text-primary flex-shrink-0" />}
    </div>
  );
}
