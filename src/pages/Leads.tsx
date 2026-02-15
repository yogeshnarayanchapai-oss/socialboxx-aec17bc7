import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, MoreVertical, Phone, MessageSquare, Calendar, Loader2, Trash2, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLeads, useLeadStats, useCreateLead, useUpdateLead, useDeleteLead, type Lead } from "@/hooks/useLeads";
import { useIsMobile } from "@/hooks/use-mobile";

const statusConfig: Record<string, { label: string; type: "success" | "warning" | "info" | "pending" | "error" }> = {
  new: { label: "New", type: "info" },
  hot: { label: "Hot", type: "warning" },
  follow_up: { label: "Follow-up", type: "pending" },
  closed: { label: "Closed", type: "success" },
};

export default function Leads() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newLead, setNewLead] = useState({ full_name: "", phone: "" });
  const isMobile = useIsMobile();

  const { data: leads = [], isLoading } = useLeads({ status: statusFilter, search: searchQuery });
  const { data: stats } = useLeadStats();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const handleCreateLead = async () => {
    if (!newLead.full_name || !newLead.phone) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      await createLead.mutateAsync({
        full_name: newLead.full_name,
        phone: newLead.phone,
        status: "new",
      });
      setIsAddOpen(false);
      setNewLead({ full_name: "", phone: "" });
      toast.success("Lead created!");
    } catch (error) {
      toast.error("Failed to create lead");
    }
  };

  const handleUpdateStatus = async (lead: Lead, status: string) => {
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        updates: { status },
      });
      toast.success("Lead updated!");
    } catch (error) {
      toast.error("Failed to update lead");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this lead?")) return;

    try {
      await deleteLead.mutateAsync(id);
      toast.success("Lead deleted!");
    } catch (error) {
      toast.error("Failed to delete lead");
    }
  };

  const handleScheduleFollowUp = async (lead: Lead) => {
    const dateStr = prompt("Enter follow-up date (YYYY-MM-DD):");
    if (!dateStr) return;

    try {
      await updateLead.mutateAsync({
        id: lead.id,
        updates: { 
          followup_due_date: new Date(dateStr).toISOString(),
          status: "follow_up",
        },
      });
      toast.success("Follow-up scheduled!");
    } catch (error) {
      toast.error("Failed to schedule follow-up");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Leads"
        description="Manage and track your sales leads"
        action={
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Add Lead</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={newLead.full_name}
                    onChange={(e) => setNewLead({ ...newLead, full_name: e.target.value })}
                    placeholder="Enter name"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                    placeholder="Enter phone number"
                  />
                </div>
                <Button onClick={handleCreateLead} className="w-full" disabled={createLead.isPending}>
                  {createLead.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Lead
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-4 md:p-6">
        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="hot">Hot</SelectItem>
              <SelectItem value="follow_up">Follow-up</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats Cards */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Leads", value: stats?.total || 0, color: "text-foreground" },
            { label: "New", value: stats?.new || 0, color: "text-info" },
            { label: "Hot", value: stats?.hot || 0, color: "text-warning" },
            { label: "Follow-up", value: stats?.follow_up || 0, color: "text-primary" },
          ].map((stat) => (
            <div key={stat.label} className="metric-card">
              <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
              <p className={cn("mt-1 text-xl sm:text-2xl font-bold", stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Mobile Cards or Desktop Table */}
        {isMobile ? (
          <div className="space-y-3">
            {leads.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No leads found
              </div>
            ) : (
              leads.map((lead) => (
                <Card key={lead.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                          {lead.full_name?.split(" ").map((n) => n[0]).join("").substring(0, 2) || "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{lead.full_name || "Unknown"}</p>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span className="text-xs">{lead.phone || "—"}</span>
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {lead.conversation_id && (
                            <DropdownMenuItem onClick={() => navigate(`/inbox?conversation=${lead.conversation_id}`)}>
                              <MessageSquare className="mr-2 h-4 w-4" />
                              View Conversation
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleScheduleFollowUp(lead)}>
                            <Calendar className="mr-2 h-4 w-4" />
                            Schedule Follow-up
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(lead.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Lead
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-auto p-0">
                              <StatusBadge status={statusConfig[lead.status]?.type || "info"}>
                                {statusConfig[lead.status]?.label || lead.status}
                              </StatusBadge>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {Object.entries(statusConfig).map(([key, config]) => (
                              <DropdownMenuItem key={key} onClick={() => handleUpdateStatus(lead, key)}>
                                {config.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {(lead.source || lead.connected_pages?.page_name) && (
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                            via {lead.source || lead.connected_pages?.page_name}
                          </span>
                        )}
                        {lead.product && (
                          <span className="text-xs text-primary truncate max-w-[100px]">
                            📦 {lead.product}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {lead.followup_due_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(lead.followup_due_date).toLocaleDateString()}
                          </div>
                        )}
                        <span>{new Date(lead.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Remark</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No leads found
                      </TableCell>
                    </TableRow>
                  ) : (
                    leads.map((lead) => (
                      <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                              {lead.full_name?.split(" ").map((n) => n[0]).join("").substring(0, 2) || "?"}
                            </div>
                            <div>
                              <p className="font-medium">{lead.full_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {lead.last_message || "No messages"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{lead.phone || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{lead.product || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{lead.remark || "No Inquiry"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{lead.source || lead.connected_pages?.page_name || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-auto p-0">
                                <StatusBadge status={statusConfig[lead.status]?.type || "info"}>
                                  {statusConfig[lead.status]?.label || lead.status}
                                </StatusBadge>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {Object.entries(statusConfig).map(([key, config]) => (
                                <DropdownMenuItem key={key} onClick={() => handleUpdateStatus(lead, key)}>
                                  {config.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell>
                          {lead.followup_due_date ? (
                            <div className="flex items-center gap-1.5 text-sm">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {new Date(lead.followup_due_date).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {lead.conversation_id && (
                                <DropdownMenuItem onClick={() => navigate(`/inbox?conversation=${lead.conversation_id}`)}>
                                  <MessageSquare className="mr-2 h-4 w-4" />
                                  View Conversation
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleScheduleFollowUp(lead)}>
                                <Calendar className="mr-2 h-4 w-4" />
                                Schedule Follow-up
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(lead.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Lead
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
