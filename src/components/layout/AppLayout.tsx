import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64">
        <Outlet />
      </main>
    </div>
  );
}
