import { useState } from "react";
import { Plus, Search, Filter, MoreVertical, Phone, MessageSquare, Calendar } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
import { cn } from "@/lib/utils";

const mockLeads = [
  {
    id: "1",
    full_name: "Emma Wilson",
    phone: "+1 555-123-4567",
    page_name: "Sales",
    status: "hot",
    last_message: "I'd like to place a bulk order for 500 units",
    assigned_to: "John Doe",
    followup_due_date: "2024-02-01",
    created_at: "2024-01-28",
  },
  {
    id: "2",
    full_name: "Alex Chen",
    phone: "+1 555-987-6543",
    page_name: "Main Store",
    status: "new",
    last_message: "My phone number is 09123456789",
    assigned_to: null,
    followup_due_date: null,
    created_at: "2024-01-29",
  },
  {
    id: "3",
    full_name: "Maria Garcia",
    phone: "+1 555-456-7890",
    page_name: "Support",
    status: "follow_up",
    last_message: "Can you call me back please?",
    assigned_to: "Jane Smith",
    followup_due_date: "2024-01-30",
    created_at: "2024-01-25",
  },
  {
    id: "4",
    full_name: "David Kim",
    phone: "+1 555-321-0987",
    page_name: "Sales",
    status: "closed",
    last_message: "Thank you, I completed my purchase!",
    assigned_to: "John Doe",
    followup_due_date: null,
    created_at: "2024-01-20",
  },
];

const statusConfig: Record<string, { label: string; type: "success" | "warning" | "info" | "pending" | "error" }> = {
  new: { label: "New", type: "info" },
  hot: { label: "Hot", type: "warning" },
  follow_up: { label: "Follow-up", type: "pending" },
  closed: { label: "Closed", type: "success" },
};

export default function Leads() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredLeads = mockLeads.filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        lead.full_name.toLowerCase().includes(query) ||
        lead.phone.includes(query)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Leads"
        description="Manage and track your sales leads"
        action={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Lead
          </Button>
        }
      />

      <div className="p-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
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
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          {[
            { label: "Total Leads", value: mockLeads.length, color: "text-foreground" },
            { label: "New", value: mockLeads.filter((l) => l.status === "new").length, color: "text-info" },
            { label: "Hot", value: mockLeads.filter((l) => l.status === "hot").length, color: "text-warning" },
            { label: "Follow-up Due", value: mockLeads.filter((l) => l.status === "follow_up").length, color: "text-primary" },
          ].map((stat) => (
            <div key={stat.label} className="metric-card">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className={cn("mt-1 text-2xl font-bold", stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {lead.full_name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="font-medium">{lead.full_name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {lead.last_message}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{lead.phone}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{lead.page_name}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={statusConfig[lead.status].type}>
                      {statusConfig[lead.status].label}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {lead.assigned_to || "Unassigned"}
                    </span>
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
                        <DropdownMenuItem>
                          <MessageSquare className="mr-2 h-4 w-4" />
                          View Conversation
                        </DropdownMenuItem>
                        <DropdownMenuItem>Edit Lead</DropdownMenuItem>
                        <DropdownMenuItem>Schedule Follow-up</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          Delete Lead
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
