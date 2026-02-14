import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Inbox,
  Users,
  Zap,
  BarChart3,
  Settings,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSidebarState } from "@/hooks/useSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

const navigationItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Pages", href: "/pages", icon: FileText },
  { name: "Inbox", href: "/inbox", icon: Inbox },
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Automation", href: "/automation", icon: Zap },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

const platformItems = [
  { name: "Messenger", href: "/inbox", icon: MessageSquare, active: true },
  { name: "WhatsApp", href: "/platform/whatsapp", icon: null, emoji: "💬", active: false },
  { name: "Instagram", href: "/platform/instagram", icon: null, emoji: "📸", active: false },
  { name: "TikTok", href: "/platform/tiktok", icon: null, emoji: "🎵", active: false },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, toggle, close } = useSidebarState();
  const isMobile = useIsMobile();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error signing out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
    }
  };

  const PlatformSection = () => (
    <div className="mt-4 pt-4 border-t border-sidebar-border">
      {isOpen && <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Platforms</p>}
      {platformItems.map((item) => {
        const isActive = location.pathname === item.href || (item.href === "/inbox" && location.pathname === "/inbox");
        return (
          <NavLink
            key={item.name}
            to={item.href}
            onClick={isMobile ? close : undefined}
            title={!isOpen ? item.name : undefined}
            className={cn(
              "nav-item relative",
              isActive ? "nav-item-active" : "nav-item-inactive",
              !isOpen && !isMobile && "justify-center px-0"
            )}
          >
            {item.icon ? (
              <item.icon className="h-5 w-5 flex-shrink-0" />
            ) : (
              <span className="text-base flex-shrink-0 w-5 text-center">{item.emoji}</span>
            )}
            {(isOpen || isMobile) && (
              <>
                {item.name}
                {!item.active && (
                  <span className="ml-auto text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">Soon</span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );

  // Mobile overlay
  if (isMobile) {
    return (
      <>
        {isOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={close} />
        )}
        <aside className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-sidebar transition-transform duration-300 md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <MessageSquare className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-sidebar-accent-foreground">SocialBox</span>
            </div>
            <Button variant="ghost" size="icon" onClick={close}><X className="h-5 w-5" /></Button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {navigationItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <NavLink key={item.name} to={item.href} onClick={close}
                  className={cn("nav-item", isActive ? "nav-item-active" : "nav-item-inactive")}>
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </NavLink>
              );
            })}
            <PlatformSection />
          </nav>
          <div className="border-t border-sidebar-border p-4">
            <button onClick={handleLogout}
              className="nav-item nav-item-inactive w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive">
              <LogOut className="h-5 w-5" />Sign Out
            </button>
          </div>
        </aside>
      </>
    );
  }

  // Desktop sidebar
  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 flex h-screen flex-col bg-sidebar transition-all duration-300",
      isOpen ? "w-64" : "w-16"
    )}>
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary">
          <MessageSquare className="h-5 w-5 text-primary-foreground" />
        </div>
        {isOpen && <span className="text-lg font-bold text-sidebar-accent-foreground">SocialBox</span>}
      </div>
      <div className="px-3 py-2">
        <Button variant="ghost" size="icon" onClick={toggle} className="h-9 w-9"
          title={isOpen ? "Collapse sidebar" : "Expand sidebar"}>
          {isOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navigationItems.map((item) => {
          const isActive = location.pathname.startsWith(item.href);
          return (
            <NavLink key={item.name} to={item.href}
              title={!isOpen ? item.name : undefined}
              className={cn("nav-item", isActive ? "nav-item-active" : "nav-item-inactive", !isOpen && "justify-center px-0")}>
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {isOpen && item.name}
            </NavLink>
          );
        })}
        <PlatformSection />
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <button onClick={handleLogout}
          title={!isOpen ? "Sign Out" : undefined}
          className={cn("nav-item nav-item-inactive w-full text-destructive hover:bg-destructive/10 hover:text-destructive",
            isOpen ? "justify-start" : "justify-center px-0")}>
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {isOpen && "Sign Out"}
        </button>
      </div>
    </aside>
  );
}
