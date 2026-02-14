import { useState, useEffect } from "react";
import { Plus, Facebook, MoreVertical, Loader2, AlertCircle, Settings2, Trash2, RefreshCw, MessageSquare, Construction } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useConnectedPages } from "@/hooks/usePages";
import { FacebookConnectWizard } from "@/components/facebook/FacebookConnectWizard";
import { PageAutomationDialog } from "@/components/pages/PageAutomationDialog";
import { useDisconnectPage } from "@/hooks/useFacebookOAuth";
import { supabase } from "@/integrations/supabase/client";

const platformItems = [
  { name: "Messenger", emoji: "💬", icon: MessageSquare, active: true },
  { name: "WhatsApp", emoji: "💬", icon: null, active: false },
  { name: "Instagram", emoji: "📸", icon: null, active: false },
  { name: "TikTok", emoji: "🎵", icon: null, active: false },
];

export default function Pages() {
  const { data: pages = [], isLoading, refetch } = useConnectedPages();
  const disconnectPage = useDisconnectPage();
  
  // Check URL params synchronously to avoid race condition with child hook cleaning them
  const hasOAuthCallback = () => {
    const params = new URLSearchParams(window.location.search);
    return params.has("fb_session") || params.has("fb_error");
  };

  const [isWizardOpen, setIsWizardOpen] = useState(hasOAuthCallback);
  const [automationPage, setAutomationPage] = useState<typeof pages[0] | null>(null);
  const [deletePageId, setDeletePageId] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState("Messenger");

  const handleDelete = async () => {
    if (!deletePageId) return;
    try {
      await disconnectPage.mutateAsync(deletePageId);
      toast.success("Page deleted successfully");
    } catch (error) {
      // Error handled in hook
    }
    setDeletePageId(null);
  };

  const handleReconnect = async (pageId: string) => {
    setReconnecting(pageId);
    try {
      const { error } = await supabase
        .from("connected_pages")
        .update({ connection_status: "active" } as any)
        .eq("id", pageId);
      if (error) throw error;
      await refetch();
      toast.success("Page reconnected successfully!");
    } catch (error) {
      toast.error("Reconnect गर्न सकिएन");
    }
    setReconnecting(null);
  };

  const getStatusVariant = (status: string): "active" | "warning" | "error" => {
    if (status === "active") return "active";
    if (status === "token_expired") return "warning";
    return "error";
  };

  const renderMessengerContent = () => (
    <>
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

      <FacebookConnectWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        onSuccess={() => refetch()}
      />

      <PageAutomationDialog
        open={!!automationPage}
        onOpenChange={(open) => !open && setAutomationPage(null)}
        page={automationPage}
      />

      <AlertDialog open={!!deletePageId} onOpenChange={(open) => !open && setDeletePageId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              यो page connection permanently delete हुनेछ। यो action undo गर्न सकिँदैन।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="p-4 md:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : pages.length === 0 ? (
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
                          <img src={page.page_picture_url} alt={page.page_name} className="h-12 w-12 rounded-full object-cover" />
                        ) : (
                          <Facebook className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{page.page_name}</h3>
                        <p className="text-xs text-muted-foreground truncate">ID: {page.page_id}</p>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="flex-shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setAutomationPage(page)}>
                          <Settings2 className="mr-2 h-4 w-4" />
                          Page Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleReconnect(page.id)} disabled={reconnecting === page.id}>
                          {reconnecting === page.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Reconnect
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeletePageId(page.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
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

                  {page.connection_status === "token_expired" && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Token expired. Click "Reconnect" to fix.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderComingSoon = () => (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Construction className="h-16 w-16 text-muted-foreground" />
      <h1 className="text-2xl font-bold">{selectedPlatform}</h1>
      <p className="text-muted-foreground max-w-md">
        यो platform को integration छिट्टै आउँदैछ। अहिलेको लागि Messenger मा काम गर्नुहोस्।
      </p>
      <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
        Coming Soon
      </span>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Platform Sidebar - horizontal on mobile, vertical on desktop */}
      <div className="flex-shrink-0 border-b border-border bg-card/50 md:w-44 md:border-b-0 md:border-r">
        <div className="p-2 md:p-3">
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:text-xs">Platforms</h2>
          <div className="flex gap-1 overflow-x-auto md:flex-col">
            {platformItems.map((item) => (
              <button
                key={item.name}
                onClick={() => setSelectedPlatform(item.name)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors text-left whitespace-nowrap md:text-sm md:px-3 md:py-2 ${
                  selectedPlatform === item.name
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {item.icon ? (
                  <item.icon className="h-3.5 w-3.5 flex-shrink-0 md:h-4 md:w-4" />
                ) : (
                  <span className="text-xs flex-shrink-0 md:text-sm">{item.emoji}</span>
                )}
                <span className="flex-1">{item.name}</span>
                {!item.active && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground md:px-2 md:text-[10px]">
                    Soon
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 min-w-0">
        {selectedPlatform === "Messenger" ? renderMessengerContent() : renderComingSoon()}
      </div>
    </div>
  );
}
