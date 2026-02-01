import { Menu, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebarState } from "@/hooks/useSidebar";

export function MobileHeader() {
  const { toggle } = useSidebarState();

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
      <Button variant="ghost" size="icon" onClick={toggle}>
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <MessageSquare className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold">SocialBox</span>
      </div>
    </header>
  );
}
