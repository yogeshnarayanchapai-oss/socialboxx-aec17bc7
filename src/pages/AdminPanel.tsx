import { useState } from "react";
import { useAllOrganizations } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Loader2, CheckCircle, XCircle, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminPanel() {
  const { data: orgs = [], isLoading } = useAllOrganizations();
  const [processing, setProcessing] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleAction = async (orgId: string, action: "approved" | "rejected") => {
    setProcessing(orgId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("organizations")
        .update({
          status: action,
          approved_by: user?.id,
          approved_at: action === "approved" ? new Date().toISOString() : null,
        })
        .eq("id", orgId);

      if (error) throw error;
      toast.success(`Organization ${action}`);
      queryClient.invalidateQueries({ queryKey: ["all-organizations"] });
    } catch (error) {
      toast.error("Action failed");
    }
    setProcessing(null);
  };

  const getStatusVariant = (status: string): "active" | "warning" | "error" => {
    if (status === "approved") return "active";
    if (status === "pending") return "warning";
    return "error";
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Platform Admin"
        description="Manage organization signups and approvals"
      />
      <div className="p-4 md:p-6 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No organizations yet</p>
        ) : (
          orgs.map((org) => (
            <Card key={org.id} className="animate-fade-in">
              <CardContent className="p-4 md:p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{org.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        Created: {new Date(org.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={getStatusVariant(org.status)}>
                      {org.status}
                    </StatusBadge>
                    {org.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleAction(org.id, "approved")}
                          disabled={processing === org.id}
                        >
                          {processing === org.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle className="mr-1 h-3 w-3" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAction(org.id, "rejected")}
                          disabled={processing === org.id}
                        >
                          <XCircle className="mr-1 h-3 w-3" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Plan: <span className="font-medium capitalize">{org.plan}</span>
                  {" · "}Max Pages: {org.max_pages}
                  {" · "}Max Team: {org.max_team_members}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
