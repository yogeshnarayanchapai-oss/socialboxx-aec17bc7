import { useState } from "react";
import { Plus, Facebook, MoreVertical, RefreshCw, Trash2, ExternalLink } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

// Mock connected pages
const mockPages = [
  {
    id: "1",
    page_name: "My Business Store",
    page_id: "123456789",
    connection_status: "active",
    page_picture_url: null,
    created_at: "2024-01-15",
  },
  {
    id: "2",
    page_name: "Customer Support",
    page_id: "987654321",
    connection_status: "active",
    page_picture_url: null,
    created_at: "2024-01-20",
  },
];

export default function Pages() {
  const [pages, setPages] = useState(mockPages);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [manualPageId, setManualPageId] = useState("");

  const handleOAuthConnect = () => {
    // In production, this would redirect to Facebook OAuth
    toast.info("Facebook OAuth would open here. This requires Meta App setup.");
  };

  const handleManualConnect = () => {
    if (!manualToken || !manualPageId) {
      toast.error("Please provide both Page ID and Access Token");
      return;
    }
    
    // Mock adding a page
    const newPage = {
      id: String(Date.now()),
      page_name: `Page ${manualPageId}`,
      page_id: manualPageId,
      connection_status: "active",
      page_picture_url: null,
      created_at: new Date().toISOString(),
    };
    
    setPages([...pages, newPage]);
    setIsConnectOpen(false);
    setManualToken("");
    setManualPageId("");
    toast.success("Page connected successfully!");
  };

  const handleDisconnect = (pageId: string) => {
    setPages(pages.filter((p) => p.id !== pageId));
    toast.success("Page disconnected");
  };

  const handleRefresh = (pageId: string) => {
    toast.success("Token validated successfully");
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Connected Pages"
        description="Manage your Facebook Pages connections"
        action={
          <Dialog open={isConnectOpen} onOpenChange={setIsConnectOpen}>
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
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <Facebook className="mx-auto h-12 w-12 text-[#1877F2]" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Sign in with Facebook to automatically connect your pages
                    </p>
                  </div>
                  <Button 
                    onClick={handleOAuthConnect} 
                    className="w-full bg-[#1877F2] hover:bg-[#1877F2]/90"
                  >
                    <Facebook className="mr-2 h-4 w-4" />
                    Continue with Facebook
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
                  </div>
                  <Button onClick={handleManualConnect} className="w-full">
                    Connect Page
                  </Button>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-6">
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
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1877F2]/10">
                        <Facebook className="h-6 w-6 text-[#1877F2]" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{page.page_name}</h3>
                        <p className="text-xs text-muted-foreground">
                          ID: {page.page_id}
                        </p>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRefresh(page.id)}>
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
                  
                  <div className="mt-4 flex items-center justify-between">
                    <StatusBadge status={page.connection_status === "active" ? "active" : "error"}>
                      {page.connection_status}
                    </StatusBadge>
                    <span className="text-xs text-muted-foreground">
                      Connected {new Date(page.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
