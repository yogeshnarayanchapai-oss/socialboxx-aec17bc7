import { useState } from "react";
import { useAllOrganizations } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Loader2, CheckCircle, XCircle, Building2, Pencil, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminPanel() {
  const { data: orgs = [], isLoading } = useAllOrganizations();
  const [processing, setProcessing] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editOrg, setEditOrg] = useState<{ id: string; name: string; max_pages: number; max_team_members: number } | null>(null);
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["all-organizations"] });

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
      invalidate();
    } catch { toast.error("Action failed"); }
    setProcessing(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      // Delete members first, then org
      await supabase.from("organization_members").delete().eq("organization_id", deleteId);
      const { error } = await supabase.from("organizations").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Organization deleted");
      invalidate();
    } catch { toast.error("Delete failed"); }
    setDeleteId(null);
  };

  const handleEditSave = async () => {
    if (!editOrg) return;
    setProcessing(editOrg.id);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: editOrg.name,
          max_pages: editOrg.max_pages,
          max_team_members: editOrg.max_team_members,
        })
        .eq("id", editOrg.id);
      if (error) throw error;
      toast.success("Organization updated");
      invalidate();
      setEditOrg(null);
    } catch { toast.error("Update failed"); }
    setProcessing(null);
  };

  const getStatusVariant = (status: string): "active" | "warning" | "error" => {
    if (status === "approved") return "active";
    if (status === "pending") return "warning";
    return "error";
  };

  return (
    <div className="min-h-screen">
      <PageHeader title="Platform Admin" description="Manage organization signups and approvals" />
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
                        <Button size="sm" onClick={() => handleAction(org.id, "approved")} disabled={processing === org.id}>
                          {processing === org.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle className="mr-1 h-3 w-3" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleAction(org.id, "rejected")} disabled={processing === org.id}>
                          <XCircle className="mr-1 h-3 w-3" /> Reject
                        </Button>
                      </>
                    )}
                    {/* Edit & Delete buttons for all orgs */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditOrg({
                        id: org.id,
                        name: org.name,
                        max_pages: org.max_pages,
                        max_team_members: org.max_team_members,
                      })}
                    >
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(org.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
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

      {/* Edit Dialog */}
      <Dialog open={!!editOrg} onOpenChange={(open) => !open && setEditOrg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
          </DialogHeader>
          {editOrg && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input value={editOrg.name} onChange={(e) => setEditOrg({ ...editOrg, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Pages</Label>
                  <Input type="number" value={editOrg.max_pages} onChange={(e) => setEditOrg({ ...editOrg, max_pages: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Team Members</Label>
                  <Input type="number" value={editOrg.max_team_members} onChange={(e) => setEditOrg({ ...editOrg, max_team_members: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrg(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={processing === editOrg?.id}>
              {processing === editOrg?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
            <AlertDialogDescription>
              यो organization permanently delete हुनेछ। सबै members र data पनि हट्नेछ। यो action undo गर्न सकिँदैन।
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
    </div>
  );
}
