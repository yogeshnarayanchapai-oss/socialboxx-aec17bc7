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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const navigationItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Pages", href: "/pages", icon: FileText },
  { name: "Inbox", href: "/inbox", icon: Inbox },
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Automation", href: "/automation", icon: Zap },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error signing out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
    }
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <MessageSquare className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-sidebar-accent-foreground">
          SocialBox
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigationItems.map((item) => {
          const isActive = location.pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={cn(
                "nav-item",
                isActive ? "nav-item-active" : "nav-item-inactive"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-4">
        <button
          onClick={handleLogout}
          className="nav-item nav-item-inactive w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
