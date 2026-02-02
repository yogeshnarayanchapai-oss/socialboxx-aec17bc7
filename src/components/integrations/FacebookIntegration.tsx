import { useState, useEffect } from "react";
import {
  Facebook,
  Check,
  ChevronRight,
  Shield,
  MessageCircle,
  AlertCircle,
  Loader2,
  MoreVertical,
  RefreshCw,
  Trash2,
  Settings2,
  Link2Off,
  Inbox,
  Zap,
  Users,
  FileText,
  Building2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useConnectedPages, useValidatePageToken } from "@/hooks/usePages";
import { FacebookConnectWizard } from "@/components/facebook/FacebookConnectWizard";
import { PageAutomationDialog } from "@/components/pages/PageAutomationDialog";
import { useFetchConversations } from "@/hooks/useConversations";
import { useTogglePageAutomation } from "@/hooks/usePageSettings";
import { useDisconnectPage } from "@/hooks/useFacebookOAuth";
import { cn } from "@/lib/utils";

// Required permissions for display
const REQUIRED_PERMISSIONS = [
  {
    key: "pages_show_list",
    icon: FileText,
    description: "Allows the API to list the pages the user manages.",
  },
  {
    key: "pages_read_engagement",
    icon: Users,
    description: "Required to read page metadata and basic info.",
  },
  {
    key: "pages_messaging",
    icon: MessageCircle,
    description: "Required to send messages to users.",
  },
  {
    key: "pages_manage_metadata",
    icon: Settings2,
    description: "Required to manage page metadata, like webhook subscriptions.",
  },
  {
    key: "business_management",
    icon: Building2,
    description: "Required to manage business accounts, so we can get page_id on /me/accounts.",
  },
  {
    key: "public_profile",
    icon: User,
    description: "Required to read user public profile data.",
  },
];

export function FacebookIntegration() {
  const { data: pages = [], isLoading, refetch } = useConnectedPages();
  const disconnectPage = useDisconnectPage();
  const validateToken = useValidatePageToken();
  const fetchConversations = useFetchConversations();
  const toggleAutomation = useTogglePageAutomation();

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [syncingPageId, setSyncingPageId] = useState<string | null>(null);
  const [automationPage, setAutomationPage] = useState<(typeof pages)[0] | null>(null);

  // Check URL for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("fb_session") || params.has("fb_error")) {
      setIsWizardOpen(true);
    }
  }, []);

  const handleDisconnect = async (pageId: string) => {
    try {
      await disconnectPage.mutateAsync(pageId);
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleRefresh = async (page: {
    id: string;
    page_id: string;
    page_access_token: string;
  }) => {
    try {
      await validateToken.mutateAsync({
        pageId: page.page_id,
        accessToken: page.page_access_token,
      });
      toast.success("Token validated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Token validation failed");
    }
  };

  const handleSyncMessages = async (pageId: string) => {
    setSyncingPageId(pageId);
    try {
      const result = await fetchConversations.mutateAsync(pageId);
      toast.success(
        `Synced ${result.conversations || 0} conversations and ${result.messages || 0} messages!`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync messages");
    } finally {
      setSyncingPageId(null);
    }
  };

  const getStatusVariant = (status: string): "active" | "warning" | "error" => {
    if (status === "active") return "active";
    if (status === "token_expired") return "warning";
    return "error";
  };

  const handleToggleAutomation = async (page: (typeof pages)[0], enabled: boolean) => {
    try {
      await toggleAutomation.mutateAsync({ pageId: page.id, enabled });
      toast.success(enabled ? "Automation enabled" : "Automation disabled");
    } catch (error) {
      toast.error("Failed to toggle automation");
    }
  };

  const handleWizardSuccess = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasConnectedPages = pages.length > 0;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
          <MessageCircle className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Connect with Messenger</h1>
          <p className="text-muted-foreground mt-1">
            Connect your messenger page to Chat Care to manage messages from your omnichannel inbox.
          </p>
        </div>
      </div>

      {/* Connection Status Card */}
      <Card className="mb-6">
        <CardContent className="p-6">
          {!hasConnectedPages ? (
            // No pages connected - show connect button
            <div className="text-center py-8">
              <div className="h-16 w-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
                <MessageCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-1">No Account Connected</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Connect your Facebook page account to start receiving messages in Chat Care.
              </p>
              <Button onClick={() => setIsWizardOpen(true)} size="lg">
                <Facebook className="mr-2 h-5 w-5" />
                Connect Facebook
              </Button>
            </div>
          ) : (
            // Show connected pages
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Connected Pages ({pages.length})</h3>
                <Button variant="outline" size="sm" onClick={() => setIsWizardOpen(true)}>
                  <Facebook className="mr-2 h-4 w-4" />
                  Add Page
                </Button>
              </div>

              <div className="space-y-3">
                {pages.map((page) => (
                  <ConnectedPageCard
                    key={page.id}
                    page={page}
                    syncingPageId={syncingPageId}
                    onDisconnect={handleDisconnect}
                    onRefresh={handleRefresh}
                    onSyncMessages={handleSyncMessages}
                    onOpenAutomation={() => setAutomationPage(page)}
                    onToggleAutomation={(enabled) => handleToggleAutomation(page, enabled)}
                    onReconnect={() => setIsWizardOpen(true)}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Required Permissions Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold">Required Permissions from Facebook</h3>
              <p className="text-sm text-muted-foreground">
                We will request the following permissions during the connection process:
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {REQUIRED_PERMISSIONS.map((permission) => (
              <div key={permission.key} className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">{permission.key}</p>
                  <p className="text-xs text-muted-foreground">{permission.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Connect Wizard Dialog */}
      <FacebookConnectWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        onSuccess={handleWizardSuccess}
      />

      {/* Automation Settings Dialog */}
      <PageAutomationDialog
        open={!!automationPage}
        onOpenChange={(open) => !open && setAutomationPage(null)}
        page={automationPage}
      />
    </div>
  );
}

interface ConnectedPageCardProps {
  page: any;
  syncingPageId: string | null;
  onDisconnect: (id: string) => void;
  onRefresh: (page: any) => void;
  onSyncMessages: (id: string) => void;
  onOpenAutomation: () => void;
  onToggleAutomation: (enabled: boolean) => void;
  onReconnect: () => void;
}

function ConnectedPageCard({
  page,
  syncingPageId,
  onDisconnect,
  onRefresh,
  onSyncMessages,
  onOpenAutomation,
  onToggleAutomation,
  onReconnect,
}: ConnectedPageCardProps) {
  const isTokenExpired = page.connection_status === "token_expired";

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        isTokenExpired ? "border-destructive/50 bg-destructive/5" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex-shrink-0 overflow-hidden">
            {page.page_picture_url ? (
              <img
                src={page.page_picture_url}
                alt={page.page_name}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 flex items-center justify-center">
                <Facebook className="h-6 w-6 text-primary" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold truncate">{page.page_name}</h4>
              <span
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium",
                  isTokenExpired
                    ? "bg-destructive/20 text-destructive"
                    : "bg-green-500/20 text-green-700"
                )}
              >
                {isTokenExpired ? "Token Expired" : "Active"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">ID: {page.page_id}</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="flex-shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSyncMessages(page.id)}>
              <Inbox className="mr-2 h-4 w-4" />
              Sync Messages
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenAutomation}>
              <Settings2 className="mr-2 h-4 w-4" />
              Automation Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onRefresh(page)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Validate Token
            </DropdownMenuItem>
            {isTokenExpired && (
              <DropdownMenuItem onClick={onReconnect}>
                <Link2Off className="mr-2 h-4 w-4" />
                Reconnect
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onDisconnect(page.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Automation Toggle */}
      <div
        className={cn(
          "mt-4 flex items-center justify-between rounded-lg border-2 p-3 transition-colors",
          page.automation_enabled
            ? "border-accent/50 bg-accent/5"
            : "border-dashed border-muted-foreground/30"
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "rounded-full p-1.5",
              page.automation_enabled
                ? "bg-accent/20 text-accent-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <span className="text-sm font-medium">Auto-Reply</span>
            <p className="text-xs text-muted-foreground">
              {page.automation_enabled
                ? "✓ First message + keywords active"
                : "Turn on to auto-reply"}
            </p>
          </div>
        </div>
        <Switch
          checked={page.automation_enabled || false}
          onCheckedChange={onToggleAutomation}
          disabled={isTokenExpired}
        />
      </div>

      {/* Token Expired Warning */}
      {isTokenExpired && (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Token expired. Click the menu and select "Reconnect" to fix.
          </AlertDescription>
        </Alert>
      )}

      {/* Sync Button */}
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        onClick={() => onSyncMessages(page.id)}
        disabled={syncingPageId === page.id || isTokenExpired}
      >
        {syncingPageId === page.id ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        {syncingPageId === page.id ? "Syncing..." : "Sync Messages"}
      </Button>
    </div>
  );
}
