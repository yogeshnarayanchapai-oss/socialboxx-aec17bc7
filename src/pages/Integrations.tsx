import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Facebook,
  Instagram,
  MessageCircle,
  Search,
  Loader2,
  Plug,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FacebookIntegration } from "@/components/integrations/FacebookIntegration";

export interface IntegrationItem {
  id: string;
  name: string;
  icon: React.ElementType;
  iconColor?: string;
  category: "messaging" | "ecommerce" | "ai";
  available: boolean;
  connected?: boolean;
}

const INTEGRATIONS: IntegrationItem[] = [
  // Messaging Channels
  {
    id: "facebook",
    name: "Facebook Messenger",
    icon: Facebook,
    iconColor: "text-blue-600",
    category: "messaging",
    available: true,
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: Instagram,
    iconColor: "text-pink-500",
    category: "messaging",
    available: false,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: MessageCircle,
    iconColor: "text-green-500",
    category: "messaging",
    available: false,
  },
];

export default function Integrations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Get selected integration from URL or default to facebook
  const selectedId = searchParams.get("channel") || "facebook";
  
  const selectedIntegration = INTEGRATIONS.find((i) => i.id === selectedId) || INTEGRATIONS[0];

  const filteredIntegrations = INTEGRATIONS.filter((integration) =>
    integration.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const messagingIntegrations = filteredIntegrations.filter((i) => i.category === "messaging");

  const handleSelectIntegration = (id: string) => {
    setSearchParams({ channel: id });
  };

  // Check URL for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("fb_session") || params.has("fb_error")) {
      // Keep the facebook channel selected and let FacebookIntegration handle it
      if (!params.has("channel")) {
        setSearchParams({ channel: "facebook" });
      }
    }
  }, []);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex-shrink-0 hidden md:flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Integrations
          </h2>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Integration Categories */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Messaging Channels */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Messaging Channels ({messagingIntegrations.length})
            </h3>
            <div className="space-y-1">
              {messagingIntegrations.map((integration) => (
                <IntegrationSidebarItem
                  key={integration.id}
                  integration={integration}
                  selected={selectedId === integration.id}
                  onClick={() => handleSelectIntegration(integration.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile Header */}
        <div className="md:hidden p-4 border-b">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Integrations
          </h2>
        </div>

        {/* Mobile Integration Selector */}
        <div className="md:hidden p-3 border-b">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {INTEGRATIONS.map((integration) => (
              <button
                key={integration.id}
                onClick={() => handleSelectIntegration(integration.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border whitespace-nowrap text-sm transition-colors",
                  selectedId === integration.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                )}
              >
                <integration.icon className={cn("h-4 w-4", integration.iconColor)} />
                {integration.name}
              </button>
            ))}
          </div>
        </div>

        {/* Integration Content */}
        <div className="p-4 md:p-6">
          {selectedIntegration.id === "facebook" && <FacebookIntegration />}
          
          {selectedIntegration.id !== "facebook" && (
            <ComingSoonIntegration integration={selectedIntegration} />
          )}
        </div>
      </main>
    </div>
  );
}

function IntegrationSidebarItem({
  integration,
  selected,
  onClick,
}: {
  integration: IntegrationItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!integration.available}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
        selected
          ? "bg-primary/10 text-primary border border-primary/30"
          : integration.available
          ? "hover:bg-muted text-foreground"
          : "opacity-50 cursor-not-allowed text-muted-foreground"
      )}
    >
      <integration.icon className={cn("h-5 w-5 flex-shrink-0", integration.iconColor)} />
      <span className="flex-1 truncate text-sm font-medium">{integration.name}</span>
      {!integration.available && (
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Soon</span>
      )}
      {integration.connected && (
        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
      )}
    </button>
  );
}

function ComingSoonIntegration({ integration }: { integration: IntegrationItem }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <integration.icon className={cn("h-10 w-10", integration.iconColor)} />
      </div>
      <h2 className="text-xl font-semibold mb-2">{integration.name}</h2>
      <p className="text-muted-foreground max-w-md">
        This integration is coming soon. We're working hard to bring you more messaging channels.
      </p>
    </div>
  );
}
