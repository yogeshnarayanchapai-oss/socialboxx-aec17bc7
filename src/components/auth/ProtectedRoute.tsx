import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import PendingApproval from "@/pages/PendingApproval";
import RejectedAccount from "@/pages/RejectedAccount";

export function ProtectedRoute() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { data: org, isLoading: orgLoading } = useOrganization(session?.user?.id);

  if (isLoading || (session && orgLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // Check org status
  if (org) {
    if (org.status === "pending") {
      return <PendingApproval />;
    }
    if (org.status === "rejected") {
      return <RejectedAccount />;
    }
  }

  return <Outlet />;
}
