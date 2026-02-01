import { useState } from "react";
import { Plus, Facebook, MoreVertical, RefreshCw, Trash2, ExternalLink, Loader2, Inbox, AlertCircle, Settings2, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useConnectedPages, useConnectPage, useDisconnectPage, useValidatePageToken } from "@/hooks/usePages";
import { useFacebookLogin } from "@/hooks/useFacebookPages";
import { PageSelectionDialog } from "@/components/pages/PageSelectionDialog";
import { PageAutomationDialog } from "@/components/pages/PageAutomationDialog";
import { useFetchConversations } from "@/hooks/useConversations";
import { useTogglePageAutomation } from "@/hooks/usePageSettings";

export default function Pages() {
  const { data: pages = [], isLoading } = useConnectedPages();
  const connectPage = useConnectPage();
  const disconnectPage = useDisconnectPage();
  const validateToken = useValidatePageToken();
  const fetchConversations = useFetchConversations();
  const toggleAutomation = useTogglePageAutomation();
  
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [manualPageId, setManualPageId] = useState("");
  const [syncingPageId, setSyncingPageId] = useState<string | null>(null);
  const [automationPage, setAutomationPage] = useState<typeof pages[0] | null>(null);

  const {
    pages: fbPages,
    isLoading: fbLoading,
    showPageSelection,
    error: fbError,
    initiateLogin,
    reset: resetFbLogin,
    setShowPageSelection,
  } = useFacebookLogin();

  const handleOAuthConnect = async () => {
    try {
      await initiateLogin();
    } catch (error) {
      // Error is handled in the hook
    }
  };

  const handleManualConnect = async () => {
    if (!manualToken || !manualPageId) {
      toast.error("Please provide both Page ID and Access Token");
      return;
    }

    try {
      await connectPage.mutateAsync({
        pageId: manualPageId,
        accessToken: manualToken,
      });
      setIsConnectOpen(false);
      setManualToken("");
      setManualPageId("");
      toast.success("Page connected successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect page");
    }
  };

  const handleDisconnect = async (pageId: string) => {
    try {
      await disconnectPage.mutateAsync(pageId);
      toast.success("Page disconnected");
    } catch (error) {
      toast.error("Failed to disconnect page");
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

  const handlePageSelectionSuccess = () => {
    resetFbLogin();
    setIsConnectOpen(false);
  };

  const handleDialogClose = (open: boolean) => {
    setIsConnectOpen(open);
    if (!open) {
      resetFbLogin();
      setManualToken("");
      setManualPageId("");
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
          <Dialog open={isConnectOpen} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Connect New Page
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Connect Facebook Page</DialogTitle>
                <DialogDescription>
                  Connect your Facebook Page to start receiving messages
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="oauth" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="oauth">Login with Facebook</TabsTrigger>
                  <TabsTrigger value="manual">Manual Token</TabsTrigger>
                </TabsList>
                
                <TabsContent value="oauth" className="mt-4 space-y-4">
                  {fbError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{fbError}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <Facebook className="mx-auto h-12 w-12 text-[#1877F2]" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Sign in with Facebook to automatically connect your pages
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Required permissions: pages_show_list, pages_messaging, pages_read_engagement
                    </p>
                  </div>
                  <Button 
                    onClick={handleOAuthConnect} 
                    className="w-full bg-[#1877F2] hover:bg-[#1877F2]/90"
                    disabled={fbLoading}
                  >
                    {fbLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Facebook className="mr-2 h-4 w-4" />
                    {fbLoading ? "Connecting..." : "Continue with Facebook"}
                  </Button>
                </TabsContent>
                
                <TabsContent value="manual" className="mt-4 space-y-4">
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="pageId">Page ID</Label>
                      <Input
                        id="pageId"
                        placeholder="Enter your Facebook Page ID"
                        value={manualPageId}
                        onChange={(e) => setManualPageId(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="token">Page Access Token</Label>
                      <Input
                        id="token"
                        type="password"
                        placeholder="Enter your Page Access Token"
                        value={manualToken}
                        onChange={(e) => setManualToken(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      You can get these from the{" "}
                      <a
                        href="https://developers.facebook.com/tools/explorer"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Meta Graph API Explorer
                        <ExternalLink className="ml-1 inline h-3 w-3" />
                      </a>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Required permissions: pages_show_list, pages_messaging, pages_read_engagement
                    </p>
                  </div>
                  <Button 
                    onClick={handleManualConnect} 
                    className="w-full"
                    disabled={connectPage.isPending}
                  >
                    {connectPage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Connect Page
                  </Button>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Page Selection Dialog for Facebook OAuth */}
      <PageSelectionDialog
        open={showPageSelection}
        onOpenChange={setShowPageSelection}
        pages={fbPages}
        onSuccess={handlePageSelectionSuccess}
        isLoading={fbLoading && !showPageSelection}
        error={fbError}
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
            onAction={() => setIsConnectOpen(true)}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => (
              <Card key={page.id} className="animate-fade-in">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10">
                        {page.page_picture_url ? (
                          <img 
                            src={page.page_picture_url} 
                            alt={page.page_name} 
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <Facebook className="h-6 w-6 text-[#1877F2]" />
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

                  {/* Automation Toggle */}
                  <div className="mt-4 flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Zap className={`h-4 w-4 ${(page as any).automation_enabled ? 'text-warning' : 'text-muted-foreground'}`} />
                      <span className="text-sm font-medium">Automation</span>
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
                        Token expired. Please reconnect this page.
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
