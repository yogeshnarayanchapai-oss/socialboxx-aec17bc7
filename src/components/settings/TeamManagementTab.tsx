import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Trash2, UserPlus, Shield, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useTeamMembers, useInviteTeamMember, useRemoveTeamMember, useUpdatePageAccess } from "@/hooks/useTeamMembers";
import { useConnectedPages } from "@/hooks/usePages";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";

export function TeamManagementTab() {
  const { user } = useAuth();
  const { data: org } = useOrganization(user?.id);
  const orgId = org?.id;
  const { data: members, isLoading } = useTeamMembers(orgId);
  const { data: pages } = useConnectedPages();
  const inviteMember = useInviteTeamMember();
  const removeMember = useRemoveTeamMember();
  const updateAccess = useUpdatePageAccess();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [accessDialogMember, setAccessDialogMember] = useState<string | null>(null);
  // Page access state for invite dialog
  const [invitePageAccess, setInvitePageAccess] = useState<Record<string, string>>({});

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !orgId) return;
    try {
      const userId = await inviteMember.mutateAsync({
        email: inviteEmail.trim(),
        organizationId: orgId,
        role: inviteRole,
        name: inviteName.trim() || undefined,
      });
      // Set page access for the newly added member
      for (const [pageId, level] of Object.entries(invitePageAccess)) {
        if (level !== "none") {
          await updateAccess.mutateAsync({
            userId,
            organizationId: orgId,
            pageId,
            accessLevel: level,
          });
        }
      }
      toast.success("Team member added!");
      setInviteEmail("");
      setInviteName("");
      setInvitePageAccess({});
      setInviteDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to invite member");
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await removeMember.mutateAsync(memberId);
      toast.success("Team member removed");
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const handleAccessChange = async (
    userId: string,
    pageId: string,
    accessLevel: string | null
  ) => {
    if (!orgId) return;
    try {
      await updateAccess.mutateAsync({ userId, organizationId: orgId, pageId, accessLevel });
    } catch {
      toast.error("Failed to update access");
    }
  };

  const currentMember = members?.find((m) => m.user_id === accessDialogMember);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>Manage team access and page permissions</CardDescription>
          </div>
          <Dialog open={inviteDialogOpen} onOpenChange={(open) => {
            setInviteDialogOpen(open);
            if (!open) { setInvitePageAccess({}); setInviteName(""); }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
                <DialogDescription>
                  The user must have an existing account. Enter their registered email.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="Member's name"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    placeholder="member@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Page Access Section in Invite Dialog */}
                {pages && pages.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Page Access</Label>
                    <p className="text-xs text-muted-foreground">कुन page मा कस्तो access दिने?</p>
                    <div className="space-y-2 rounded-lg border p-3">
                      {pages.map((page) => (
                        <div
                          key={page.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {page.page_picture_url ? (
                              <img src={page.page_picture_url} className="h-7 w-7 rounded-full flex-shrink-0" alt="" />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-muted flex-shrink-0" />
                            )}
                            <span className="text-sm truncate">{page.page_name}</span>
                          </div>
                          <Select
                            value={invitePageAccess[page.id] || "none"}
                            onValueChange={(val) => setInvitePageAccess(prev => ({ ...prev, [page.id]: val }))}
                          >
                            <SelectTrigger className="w-[100px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Access</SelectItem>
                              <SelectItem value="view">
                                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> View</span>
                              </SelectItem>
                              <SelectItem value="edit">
                                <span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleInvite} disabled={inviteMember.isPending || !inviteEmail.trim()}>
                  {inviteMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Member
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-3">
          {members?.map((member) => {
            const isCurrentUser = member.user_id === user?.id;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                    {(member.full_name || member.email || "?").substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{member.full_name || member.email || "Unknown"}</p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary capitalize">
                    {member.role}
                  </span>
                  {!isCurrentUser && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAccessDialogMember(member.user_id)}
                      >
                        <Shield className="mr-1 h-3.5 w-3.5" />
                        Pages
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemove(member.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {isCurrentUser && (
                    <span className="text-xs text-muted-foreground">(You)</span>
                  )}
                </div>
              </div>
            );
          })}

          {(!members || members.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No team members yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Page Access Dialog */}
      <Dialog open={!!accessDialogMember} onOpenChange={(open) => !open && setAccessDialogMember(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Page Access</DialogTitle>
            <DialogDescription>
              Set which pages <strong>{currentMember?.full_name || currentMember?.email}</strong> can access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[400px] overflow-y-auto">
            {pages && pages.length > 0 ? (
              pages.map((page) => {
                const access = currentMember?.page_access.find(
                  (a) => a.page_id === page.id
                );
                const currentLevel = access?.access_level || "none";

                return (
                  <div
                    key={page.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center gap-2">
                      {page.page_picture_url ? (
                        <img src={page.page_picture_url} className="h-8 w-8 rounded-full" alt="" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted" />
                      )}
                      <span className="text-sm font-medium">{page.page_name}</span>
                    </div>
                    <Select
                      value={currentLevel}
                      onValueChange={(val) => {
                        if (accessDialogMember) {
                          handleAccessChange(
                            accessDialogMember,
                            page.id,
                            val === "none" ? null : val
                          );
                        }
                      }}
                    >
                      <SelectTrigger className="w-[110px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Access</SelectItem>
                        <SelectItem value="view">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> View
                          </span>
                        </SelectItem>
                        <SelectItem value="edit">
                          <span className="flex items-center gap-1">
                            <Pencil className="h-3 w-3" /> Edit
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No pages connected yet.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessDialogMember(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
