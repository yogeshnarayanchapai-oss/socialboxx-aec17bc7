import { useState, useEffect } from "react";
import { Plus, Facebook, MoreVertical, RefreshCw, Trash2, Loader2, Inbox, AlertCircle, Settings2, Zap, Link2Off } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useConnectedPages, useValidatePageToken } from "@/hooks/usePages";
import { FacebookConnectWizard } from "@/components/facebook/FacebookConnectWizard";
import { PageAutomationDialog } from "@/components/pages/PageAutomationDialog";
import { useFetchConversations } from "@/hooks/useConversations";
import { useTogglePageAutomation } from "@/hooks/usePageSettings";
import { useDisconnectPage } from "@/hooks/useFacebookOAuth";

export default function Pages() {
  const { data: pages = [], isLoading, refetch } = useConnectedPages();
  const disconnectPage = useDisconnectPage();
  const validateToken = useValidatePageToken();
  const fetchConversations = useFetchConversations();
  const toggleAutomation = useTogglePageAutomation();
  
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [syncingPageId, setSyncingPageId] = useState<string | null>(null);
  const [automationPage, setAutomationPage] = useState<typeof pages[0] | null>(null);

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

  const handleRefresh = async (page: { id: string; page_id: string; page_access_token: string }) => {
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
      toast.success(`Synced ${result.conversations || 0} conversations and ${result.messages || 0} messages!`);
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

  const handleToggleAutomation = async (page: typeof pages[0], enabled: boolean) => {
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
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Connected Pages"
        description="Manage your Facebook Pages connections"
        action={
          <Button onClick={() => setIsWizardOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Connect New Page
          </Button>
        }
      />

      {/* Facebook Connect Wizard */}
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

      <div className="p-4 md:p-6">
        {pages.length === 0 ? (
          <EmptyState
            icon={Facebook}
            title="No pages connected"
            description="Connect your Facebook Pages to start managing messages from a unified inbox"
            actionLabel="Connect Page"
            onAction={() => setIsWizardOpen(true)}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => (
              <Card key={page.id} className="animate-fade-in">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                        {page.page_picture_url ? (
                          <img 
                            src={page.page_picture_url} 
                            alt={page.page_name} 
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <Facebook className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{page.page_name}</h3>
                        <p className="text-xs text-muted-foreground truncate">
                          ID: {page.page_id}
                        </p>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="flex-shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleSyncMessages(page.id)}>
                          <Inbox className="mr-2 h-4 w-4" />
                          Sync Messages
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAutomationPage(page)}>
                          <Settings2 className="mr-2 h-4 w-4" />
                          Automation Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleRefresh(page)}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Validate Token
                        </DropdownMenuItem>
                        {page.connection_status === "token_expired" && (
                          <DropdownMenuItem onClick={() => setIsWizardOpen(true)}>
                            <Link2Off className="mr-2 h-4 w-4" />
                            Reconnect
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDisconnect(page.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Disconnect
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <StatusBadge status={getStatusVariant(page.connection_status)}>
                      {page.connection_status === "token_expired" ? "Token Expired" : page.connection_status}
                    </StatusBadge>
                    <span className="text-xs text-muted-foreground">
                      Connected {new Date(page.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Automation Toggle - More Prominent */}
                  <div className={`mt-4 flex items-center justify-between rounded-lg border-2 p-3 transition-colors ${
                    (page as any).automation_enabled 
                      ? 'border-accent/50 bg-accent/5' 
                      : 'border-dashed border-muted-foreground/30'
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`rounded-full p-1.5 ${
                        (page as any).automation_enabled 
                          ? 'bg-accent/20 text-accent-foreground' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <Zap className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-sm font-medium">Auto-Reply</span>
                        <p className="text-xs text-muted-foreground">
                          {(page as any).automation_enabled 
                            ? '✓ First message + keywords active' 
                            : 'Turn on to auto-reply'}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={(page as any).automation_enabled || false}
                      onCheckedChange={(checked) => handleToggleAutomation(page, checked)}
                      disabled={page.connection_status === "token_expired"}
                    />
                  </div>

                  {page.connection_status === "token_expired" && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Token expired. Click "Reconnect" to fix.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Sync Messages Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => handleSyncMessages(page.id)}
                    disabled={syncingPageId === page.id || page.connection_status === "token_expired"}
                  >
                    {syncingPageId === page.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {syncingPageId === page.id ? "Syncing..." : "Sync Messages"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
