import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Trash2, UserPlus, Shield, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useTeamMembers, useInviteTeamMember, useRemoveTeamMember, useUpdatePageAccess, useUpdateMemberRole } from "@/hooks/useTeamMembers";
import { useConnectedPages } from "@/hooks/usePages";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";

export function TeamManagementTab() {
  const { user } = useAuth();
  const { data: org } = useOrganization(user?.id);
  const orgId = org?.id;
  const { data: members, isLoading } = useTeamMembers(orgId);
  const { data: pages } = useConnectedPages();
  const inviteMember = useInviteTeamMember();
  const removeMember = useRemoveTeamMember();
  const updateAccess = useUpdatePageAccess();
  const updateRole = useUpdateMemberRole();

  const { data: groups } = useQuery({
    queryKey: ["page-groups-team"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_groups")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [invitePageAccess, setInvitePageAccess] = useState<Record<string, string>>({});
  const [inviteScopes, setInviteScopes] = useState<{ type: string; groupId?: string; level: string }[]>([]);

  // Edit member state
  const [editMember, setEditMember] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editPageAccess, setEditPageAccess] = useState<Record<string, string>>({});
  const [editScopes, setEditScopes] = useState<{ type: string; groupId?: string; level: string }[]>([]);

  const currentEditMember = members?.find((m) => m.user_id === editMember);

  const handleSelectAll = (level: string, setter: (val: Record<string, string>) => void) => {
    if (!pages) return;
    const newAccess: Record<string, string> = {};
    pages.forEach(p => { newAccess[p.id] = level; });
    setter(newAccess);
  };

  const handleGroupSelect = (
    groupId: string,
    level: string,
    pageAccess: Record<string, string>,
    setPageAccess: (val: Record<string, string>) => void,
    scopes: { type: string; groupId?: string; level: string }[],
    setScopes: (val: { type: string; groupId?: string; level: string }[]) => void,
  ) => {
    if (!pages) return;
    const groupPages = pages.filter(p => p.group_id === groupId);
    const existing = scopes.find(s => s.type === "group" && s.groupId === groupId);
    
    if (existing && existing.level === level) {
      // Deselect: remove scope and uncheck group pages
      setScopes(scopes.filter(s => !(s.type === "group" && s.groupId === groupId)));
      const newAccess = { ...pageAccess };
      groupPages.forEach(p => { newAccess[p.id] = "none"; });
      setPageAccess(newAccess);
    } else {
      // Select: add/update scope and check group pages
      const newScopes = scopes.filter(s => !(s.type === "group" && s.groupId === groupId));
      newScopes.push({ type: "group", groupId, level });
      setScopes(newScopes);
      const newAccess = { ...pageAccess };
      groupPages.forEach(p => { newAccess[p.id] = level; });
      setPageAccess(newAccess);
    }
  };

  const handleUngroupedSelect = (
    level: string,
    pageAccess: Record<string, string>,
    setPageAccess: (val: Record<string, string>) => void,
    scopes: { type: string; groupId?: string; level: string }[],
    setScopes: (val: { type: string; groupId?: string; level: string }[]) => void,
  ) => {
    if (!pages) return;
    const ungrouped = pages.filter(p => !p.group_id);
    const existing = scopes.find(s => s.type === "ungrouped");
    
    if (existing && existing.level === level) {
      setScopes(scopes.filter(s => s.type !== "ungrouped"));
      const newAccess = { ...pageAccess };
      ungrouped.forEach(p => { newAccess[p.id] = "none"; });
      setPageAccess(newAccess);
    } else {
      const newScopes = scopes.filter(s => s.type !== "ungrouped");
      newScopes.push({ type: "ungrouped", level });
      setScopes(newScopes);
      const newAccess = { ...pageAccess };
      ungrouped.forEach(p => { newAccess[p.id] = level; });
      setPageAccess(newAccess);
    }
  };

  const saveScopes = async (userId: string, scopes: { type: string; groupId?: string; level: string }[]) => {
    if (!orgId) return;
    // Delete old scopes
    await supabase.from("team_access_scopes").delete().eq("user_id", userId).eq("organization_id", orgId);
    // Insert new scopes
    if (scopes.length > 0) {
      const rows = scopes.map(s => ({
        user_id: userId,
        organization_id: orgId,
        scope_type: s.type,
        group_id: s.type === "group" ? s.groupId : null,
        access_level: s.level,
      }));
      await supabase.from("team_access_scopes").insert(rows);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !invitePassword.trim() || !orgId) return;
    if (invitePassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      const userId = await inviteMember.mutateAsync({
        email: inviteEmail.trim(),
        password: invitePassword.trim(),
        organizationId: orgId,
        role: inviteRole,
        name: inviteName.trim() || undefined,
        pageAccess: invitePageAccess,
      });
      // Save scopes for auto-update
      if (userId && inviteScopes.length > 0) {
        await saveScopes(userId, inviteScopes);
      }
      toast.success("Team member added!");
      setInviteEmail("");
      setInviteName("");
      setInvitePassword("");
      setInvitePageAccess({});
      setInviteScopes([]);
      setInviteDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to invite member");
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      // Also remove scopes
      const member = members?.find(m => m.id === memberId);
      if (member && orgId) {
        await supabase.from("team_access_scopes").delete().eq("user_id", member.user_id).eq("organization_id", orgId);
      }
      await removeMember.mutateAsync(memberId);
      toast.success("Team member removed");
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const openEditDialog = async (member: typeof members extends (infer T)[] | undefined ? T : never) => {
    if (!member || !orgId) return;
    setEditMember(member.user_id);
    setEditRole(member.role);
    const access: Record<string, string> = {};
    member.page_access.forEach(a => { access[a.page_id] = a.access_level; });
    setEditPageAccess(access);
    
    // Load existing scopes
    const { data: scopeData } = await supabase
      .from("team_access_scopes")
      .select("scope_type, group_id, access_level")
      .eq("user_id", member.user_id)
      .eq("organization_id", orgId);
    
    setEditScopes((scopeData || []).map(s => ({
      type: s.scope_type,
      groupId: s.group_id || undefined,
      level: s.access_level,
    })));
  };

  const handleSaveEdit = async () => {
    if (!editMember || !orgId || !currentEditMember) return;
    try {
      if (editRole !== currentEditMember.role) {
        await updateRole.mutateAsync({ memberId: currentEditMember.id, role: editRole });
      }
      const oldAccess = new Set(currentEditMember.page_access.map(a => a.page_id));
      const newAccessKeys = new Set(Object.keys(editPageAccess).filter(k => editPageAccess[k] !== "none"));

      for (const pageId of oldAccess) {
        if (!newAccessKeys.has(pageId)) {
          await updateAccess.mutateAsync({ userId: editMember, organizationId: orgId, pageId, accessLevel: null });
        }
      }
      for (const [pageId, level] of Object.entries(editPageAccess)) {
        if (level !== "none") {
          await updateAccess.mutateAsync({ userId: editMember, organizationId: orgId, pageId, accessLevel: level });
        }
      }

      // Save scopes
      await saveScopes(editMember, editScopes);

      toast.success("Member updated!");
      setEditMember(null);
    } catch {
      toast.error("Failed to update member");
    }
  };

  const renderPageAccessSection = (
    pageAccess: Record<string, string>,
    setPageAccess: (val: Record<string, string>) => void,
    scopes: { type: string; groupId?: string; level: string }[],
    setScopes: (val: { type: string; groupId?: string; level: string }[]) => void,
  ) => {
    if (!pages || pages.length === 0) return null;

    const allSelected = pages.every(p => pageAccess[p.id] && pageAccess[p.id] !== "none");
    const noneSelected = pages.every(p => !pageAccess[p.id] || pageAccess[p.id] === "none");
    const ungroupedPages = pages.filter(p => !p.group_id);
    const ungroupedScope = scopes.find(s => s.type === "ungrouped");

    return (
      <div className="space-y-3">
        <Label className="text-sm font-medium">Page Access</Label>
        <p className="text-xs text-muted-foreground">Group/Ungrouped select गर्नुहोस् — future मा page add हुँदा auto access मिल्छ</p>
        
        {/* Group & Ungrouped quick-select chips */}
        {((groups && groups.length > 0) || ungroupedPages.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Quick Select:</p>
            <div className="flex flex-wrap gap-2">
              {groups?.map(g => {
                const groupPageIds = pages.filter(p => p.group_id === g.id).map(p => p.id);
                const scope = scopes.find(s => s.type === "group" && s.groupId === g.id);
                if (groupPageIds.length === 0) return null;
                return (
                  <div key={g.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleGroupSelect(g.id, "edit", pageAccess, setPageAccess, scopes, setScopes)}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                        scope ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      📁 {g.name} ({groupPageIds.length})
                      {scope && <span className="text-[10px] opacity-70">({scope.level})</span>}
                    </button>
                    {scope && (
                      <Select
                        value={scope.level}
                        onValueChange={(val) => {
                          handleGroupSelect(g.id, val, pageAccess, setPageAccess,
                            scopes.filter(s => !(s.type === "group" && s.groupId === g.id)),
                            setScopes
                          );
                        }}
                      >
                        <SelectTrigger className="h-7 w-[70px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">View</SelectItem>
                          <SelectItem value="edit">Edit</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
              {ungroupedPages.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleUngroupedSelect("edit", pageAccess, setPageAccess, scopes, setScopes)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                      ungroupedScope ? 'border-amber-500 bg-amber-500/10 text-amber-700' : 'border-border hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    📄 Ungrouped ({ungroupedPages.length})
                    {ungroupedScope && <span className="text-[10px] opacity-70">({ungroupedScope.level})</span>}
                  </button>
                  {ungroupedScope && (
                    <Select
                      value={ungroupedScope.level}
                      onValueChange={(val) => {
                        handleUngroupedSelect(val, pageAccess, setPageAccess,
                          scopes.filter(s => s.type !== "ungrouped"),
                          setScopes
                        );
                      }}
                    >
                      <SelectTrigger className="h-7 w-[70px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">View</SelectItem>
                        <SelectItem value="edit">Edit</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">⚡ Group/Ungrouped select गरेमा future मा page add/remove हुँदा access auto update हुन्छ</p>
          </div>
        )}

        {/* Manual select buttons */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={allSelected ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={() => handleSelectAll("edit", setPageAccess)}
          >
            Select All (Edit)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => handleSelectAll("view", setPageAccess)}
          >
            Select All (View)
          </Button>
          {!noneSelected && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => { handleSelectAll("none", setPageAccess); setScopes([]); }}
            >
              Clear All
            </Button>
          )}
        </div>

        {/* Individual page list */}
        <div className="space-y-2 rounded-lg border p-3">
          {pages.map((page) => (
            <div key={page.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Checkbox
                  checked={!!pageAccess[page.id] && pageAccess[page.id] !== "none"}
                  onCheckedChange={(checked) => {
                    setPageAccess({
                      ...pageAccess,
                      [page.id]: checked ? "view" : "none",
                    });
                  }}
                />
                {page.page_picture_url ? (
                  <img src={page.page_picture_url} className="h-7 w-7 rounded-full flex-shrink-0" alt="" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-muted flex-shrink-0" />
                )}
                <span className="text-sm truncate">{page.page_name}</span>
                {page.group_id && groups && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {groups.find(g => g.id === page.group_id)?.name}
                  </span>
                )}
              </div>
              {pageAccess[page.id] && pageAccess[page.id] !== "none" && (
                <Select
                  value={pageAccess[page.id]}
                  onValueChange={(val) => setPageAccess({ ...pageAccess, [page.id]: val })}
                >
                  <SelectTrigger className="w-[100px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> View</span>
                    </SelectItem>
                    <SelectItem value="edit">
                      <span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

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
            if (!open) { setInvitePageAccess({}); setInviteName(""); setInvitePassword(""); setInviteScopes([]); }
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
                  Enter member details. They can log in with the email and password you set.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input placeholder="Member's name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input placeholder="member@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" placeholder="Min 6 characters" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {renderPageAccessSection(invitePageAccess, setInvitePageAccess, inviteScopes, setInviteScopes)}
              </div>
              <DialogFooter>
                <Button onClick={handleInvite} disabled={inviteMember.isPending || !inviteEmail.trim() || !invitePassword.trim()}>
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
            const accessCount = member.page_access.length;
            return (
              <div key={member.id} className="flex items-center justify-between rounded-lg border border-border p-4">
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
                  {member.role !== "admin" && (
                    <span className="text-xs text-muted-foreground">
                      {accessCount} page{accessCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {!isCurrentUser && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(member)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRemove(member.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {isCurrentUser && <span className="text-xs text-muted-foreground">(You)</span>}
                </div>
              </div>
            );
          })}
          {(!members || members.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">No team members yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Edit Member Dialog */}
      <Dialog open={!!editMember} onOpenChange={(open) => !open && setEditMember(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>
              Update role and page access for <strong>{currentEditMember?.full_name || currentEditMember?.email}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renderPageAccessSection(editPageAccess, setEditPageAccess, editScopes, setEditScopes)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateRole.isPending}>
              {updateRole.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}