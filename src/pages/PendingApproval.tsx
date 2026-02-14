import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function PendingApproval() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate("/auth");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <CardTitle className="text-2xl">Account Under Review</CardTitle>
          <CardDescription className="text-base">
            तपाईंको account review मा छ। Admin ले approve गरेपछि तपाईं system use गर्न सक्नुहुनेछ।
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Approval पछि तपाईंलाई email notification आउनेछ। कृपया पर्खनुहोस्।
          </p>
          <Button variant="outline" onClick={handleSignOut} className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
