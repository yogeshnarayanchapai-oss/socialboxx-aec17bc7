import { useState, Fragment, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, ChevronDown, ChevronUp, Users } from "lucide-react";
import { Plus, Search, MoreVertical, Phone, MessageSquare, Calendar, Loader2, Trash2, Package, Download, CalendarIcon, Filter, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLeads, useLeadStats, useCreateLead, useUpdateLead, useDeleteLead, type Lead } from "@/hooks/useLeads";
import { useConnectedPages } from "@/hooks/usePages";
import { useIsMobile } from "@/hooks/use-mobile";

const statusConfig: Record<string, { label: string; type: "success" | "warning" | "info" | "pending" | "error" | "active" }> = {
  new: { label: "New", type: "info" },
  pulled: { label: "Pulled", type: "active" },
  hot: { label: "Hot", type: "warning" },
  follow_up: { label: "Follow-up", type: "pending" },
  closed: { label: "Closed", type: "success" },
};

export default function Leads() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [dateFilter, setDateFilter] = useState("today");
  const [customDateFrom, setCustomDateFrom] = useState<Date>();
  const [customDateTo, setCustomDateTo] = useState<Date>();
  const [pageFilter, setPageFilter] = useState("all");
  const [pageSearch, setPageSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newLead, setNewLead] = useState({ full_name: "", phone: "", page_id: "", product: "" });
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const isMobile = useIsMobile();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const getDateRange = () => {
    const now = new Date();
    if (dateFilter === "today") {
      return { dateFrom: startOfDay(now).toISOString(), dateTo: endOfDay(now).toISOString() };
    }
    if (dateFilter === "yesterday") {
      const yesterday = subDays(now, 1);
      return { dateFrom: startOfDay(yesterday).toISOString(), dateTo: endOfDay(yesterday).toISOString() };
    }
    if (dateFilter === "custom" && customDateFrom) {
      return {
        dateFrom: startOfDay(customDateFrom).toISOString(),
        dateTo: customDateTo ? endOfDay(customDateTo).toISOString() : endOfDay(customDateFrom).toISOString(),
      };
    }
    return {};
  };

  const dateRange = getDateRange();

  const { data: pages = [] } = useConnectedPages();
  const { data: pageGroups = [] } = useQuery({
    queryKey: ["page-groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("page_groups").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Filter pages by selected group
  const filteredPageIds = useMemo(() => {
    if (groupFilter === "all") return null;
    return pages.filter(p => p.group_id === groupFilter).map(p => p.id);
  }, [groupFilter, pages]);

  const { data: allLeads = [], isLoading } = useLeads({
    status: statusFilter,
    search: searchQuery,
    pageId: pageFilter !== "all" ? pageFilter : undefined,
    ...dateRange,
  });

  // Apply group filter client-side
  const leads = useMemo(() => {
    if (!filteredPageIds) return allLeads;
    return allLeads.filter(l => l.page_id && filteredPageIds.includes(l.page_id));
  }, [allLeads, filteredPageIds]);
  const stats = useMemo(() => ({
    total: leads.length,
    new: leads.filter(l => l.status === "new").length,
    pulled: leads.filter(l => l.status === "pulled").length,
    hot: leads.filter(l => l.status === "hot").length,
    follow_up: leads.filter(l => l.status === "follow_up").length,
    closed: leads.filter(l => l.status === "closed").length,
  }), [leads]);

  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  // Find duplicate leads - same name AND same phone number
  const duplicateLeads = useMemo(() => {
    if (!showDuplicates || leads.length === 0) return null;
    
    // Group by normalized name + phone combo
    const comboMap = new Map<string, Lead[]>();
    leads.forEach(lead => {
      const name = lead.full_name?.trim().toLowerCase();
      const phone = lead.phone?.replace(/\D/g, '');
      if (name && name.length >= 2 && phone && phone.length >= 5) {
        const key = `${name}::${phone}`;
        const existing = comboMap.get(key) || [];
        existing.push(lead);
        comboMap.set(key, existing);
      }
    });
    
    const duplicates: Lead[][] = [];
    comboMap.forEach(group => {
      if (group.length > 1) {
        duplicates.push(group);
      }
    });
    return duplicates;
  }, [leads, showDuplicates]);

  const handleExportCSV = () => {
    if (leads.length === 0) { toast.error("No leads to export"); return; }
    const headers = ["Name", "Phone", "Product", "Remark", "Source", "Status", "Follow-up Date", "Created", "Last Message"];
    const rows = leads.map((lead) => [
      lead.full_name || "",
      lead.phone || "",
      lead.product || "",
      lead.remark || "No Inquiry",
      lead.source || lead.connected_pages?.page_name || "",
      lead.status,
      lead.followup_due_date ? new Date(lead.followup_due_date).toLocaleDateString() : "",
      new Date(lead.created_at).toLocaleDateString(),
      lead.last_message || "",
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${leads.length} leads exported!`);
  };

  const handleDownloadSample = () => {
    const sampleRows = [
      { "Full Name": "Ram Bahadur", "Phone": "9800000001", "Page": pages[0]?.page_name || "", "Product": "Sample Product" },
      { "Full Name": "Sita Sharma", "Phone": "9800000002", "Page": "", "Product": "" },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows, { header: ["Full Name", "Phone", "Page", "Product"] });
    ws["!cols"] = [{ wch: 22 }, { wch: 15 }, { wch: 22 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, "leads-sample.xlsx");
  };

  const handleImportLeads = async () => {
    if (!importFile) { toast.error("Please choose a file"); return; }
    setIsImporting(true);
    try {
      const buf = await importFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (rows.length === 0) { toast.error("File is empty"); setIsImporting(false); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: orgId } = await supabase.rpc("get_user_org_id", { _user_id: user.id });
      if (!orgId) throw new Error("No organization found");

      const pageByName = new Map(pages.map((p) => [p.page_name.trim().toLowerCase(), p]));
      const inserts: any[] = [];
      const errors: string[] = [];

      rows.forEach((r, idx) => {
        const name = String(r["Full Name"] ?? r["Name"] ?? r["full_name"] ?? "").trim();
        const phone = String(r["Phone"] ?? r["phone"] ?? "").trim();
        const pageName = String(r["Page"] ?? r["page"] ?? "").trim();
        const product = String(r["Product"] ?? r["product"] ?? "").trim();
        if (!name || !phone) { errors.push(`Row ${idx + 2}: missing name or phone`); return; }
        const matchedPage = pageName ? pageByName.get(pageName.toLowerCase()) : null;
        inserts.push({
          full_name: name,
          phone,
          status: "new",
          page_id: matchedPage?.id || null,
          product: product || null,
          source: matchedPage?.page_name || null,
          organization_id: orgId,
        });
      });

      if (inserts.length === 0) {
        toast.error(`No valid rows. ${errors[0] || ""}`);
        setIsImporting(false);
        return;
      }

      const chunkSize = 500;
      let inserted = 0;
      for (let i = 0; i < inserts.length; i += chunkSize) {
        const chunk = inserts.slice(i, i + chunkSize);
        const { error } = await supabase.from("leads").insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
      }

      toast.success(`Imported ${inserted} leads${errors.length ? ` (${errors.length} skipped)` : ""}`);
      setImportFile(null);
      setIsImportOpen(false);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

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
        page_id: newLead.page_id || null,
        product: newLead.product || null,
        source: newLead.page_id ? (pages.find(p => p.id === newLead.page_id)?.page_name || null) : null,
      });
      setIsAddOpen(false);
      setNewLead({ full_name: "", phone: "", page_id: "", product: "" });
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

  const showTableLoading = isLoading;

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Leads"
        description="Manage and track your sales leads"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant={showDuplicates ? "default" : "outline"} onClick={() => setShowDuplicates(!showDuplicates)}>
              <Users className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Duplicates</span>
              <span className="sm:hidden">Dup</span>
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCSV}>
              <Download className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Import</span>
                  <span className="sm:hidden">Imp</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Leads from Excel</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                    <p className="mb-2">
                      Sample file download garera tyahi format ma bharera upload garnus.
                      Columns: <b>Full Name</b>, <b>Phone</b> (required), <b>Page</b>, <b>Product</b> (optional).
                    </p>
                    <p>Page name exact match hunu parx connected pages sanga; nabhaye blank rakhnus.</p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={handleDownloadSample}>
                    <Download className="mr-2 h-4 w-4" /> Download Sample Excel
                  </Button>
                  <div>
                    <Label htmlFor="import-file">Choose Excel/CSV file</Label>
                    <Input
                      id="import-file"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    />
                    {importFile && (
                      <p className="text-xs text-muted-foreground mt-1">Selected: {importFile.name}</p>
                    )}
                  </div>
                  <Button className="w-full" onClick={handleImportLeads} disabled={isImporting || !importFile}>
                    {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Import Leads
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
                <div>
                  <Label htmlFor="page">Page</Label>
                  <Select
                    value={newLead.page_id || "none"}
                    onValueChange={(v) => setNewLead({ ...newLead, page_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger id="page">
                      <SelectValue placeholder="Select page" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No page</SelectItem>
                      {pages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.page_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="product">Product</Label>
                  <Input
                    id="product"
                    value={newLead.product}
                    onChange={(e) => setNewLead({ ...newLead, product: e.target.value })}
                    placeholder="Product name (optional)"
                  />
                </div>
                <Button onClick={handleCreateLead} className="w-full" disabled={createLead.isPending}>
                  {createLead.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Lead
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      <div className="p-4 md:p-6">
        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="pulled">Pulled</SelectItem>
              <SelectItem value="hot">Hot</SelectItem>
              <SelectItem value="follow_up">Follow-up</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); if (v !== "custom") { setCustomDateFrom(undefined); setCustomDateTo(undefined); } }}>
            <SelectTrigger className="w-full sm:w-36">
              <CalendarIcon className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {pages.length > 0 && (
            <Select value={pageFilter} onValueChange={setPageFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Page" />
              </SelectTrigger>
              <SelectContent>
                <div className="sticky top-0 z-10 bg-popover p-1 border-b">
                  <Input
                    autoFocus
                    placeholder="Search pages..."
                    value={pageSearch}
                    onChange={(e) => setPageSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="h-7 text-xs"
                  />
                </div>
                <SelectItem value="all">All Pages</SelectItem>
                {pages
                  .filter((p) => p.page_name.toLowerCase().includes(pageSearch.toLowerCase()))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.page_name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          {pageGroups.length > 0 && (
            <Select value={groupFilter} onValueChange={(v) => { setGroupFilter(v); if (v !== "all") setPageFilter("all"); }}>
              <SelectTrigger className="w-full sm:w-40">
                <Package className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                {pageGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {dateFilter === "custom" && (
          <div className="mb-4 flex gap-2 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-sm">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  {customDateFrom ? format(customDateFrom, "MMM dd, yyyy") : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker mode="single" selected={customDateFrom} onSelect={setCustomDateFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-sm">to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-sm">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  {customDateTo ? format(customDateTo, "MMM dd, yyyy") : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarPicker mode="single" selected={customDateTo} onSelect={setCustomDateTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Stats Cards */}
        <div className={cn("transition-opacity", showTableLoading && "opacity-50 pointer-events-none")}>
        {showTableLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total Leads", value: stats?.total || 0, color: "text-foreground" },
            { label: "New", value: stats?.new || 0, color: "text-info" },
            { label: "Pulled", value: stats?.pulled || 0, color: "text-success" },
            { label: "Hot", value: stats?.hot || 0, color: "text-warning" },
            { label: "Follow-up", value: stats?.follow_up || 0, color: "text-primary" },
          ].map((stat) => (
            <div key={stat.label} className="metric-card">
              <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
              <p className={cn("mt-1 text-xl sm:text-2xl font-bold", stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Duplicate Leads Results */}
        {showDuplicates && duplicateLeads && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Duplicate Leads ({duplicateLeads.length} groups found)
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowDuplicates(false)} className="text-xs">
                Close
              </Button>
            </div>
            {duplicateLeads.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No duplicate leads found! 🎉
              </div>
            ) : (
              duplicateLeads.map((group, gi) => (
                <Card key={gi}>
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-warning mb-2">👤 {group[0].full_name} - {group.length} duplicate entries (same name & number)</p>
                        <div className="space-y-1">
                      {group.map(lead => (
                        <div key={lead.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/50">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{lead.full_name || "Unknown"}</span>
                            <span className="text-muted-foreground font-mono">📞 {lead.phone || "N/A"}</span>
                            <StatusBadge status={statusConfig[lead.status]?.type || "info"}>
                              {statusConfig[lead.status]?.label || lead.status}
                            </StatusBadge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(lead.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
        {isMobile ? (
          <div className="space-y-3">
            {leads.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No leads found
              </div>
            ) : (
              leads.map((lead) => (
                <Card key={lead.id} className="cursor-pointer" onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}>
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
                      <div className="flex items-center gap-1">
                        {expandedLead === lead.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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
                    </div>
                    {/* Remark preview */}
                    {lead.remark && lead.remark !== "No Inquiry" && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-1">
                        <FileText className="inline h-3 w-3 mr-1" />
                        {lead.remark}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-auto p-0" onClick={(e) => e.stopPropagation()}>
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
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</span>
                    </div>
                    {/* Expanded details */}
                    {expandedLead === lead.id && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2 text-sm">
                        {lead.product && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Product</span>
                            <span className="font-medium">{lead.product}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Remark</span>
                          <span className="font-medium text-right max-w-[60%]">{lead.remark || "No Inquiry"}</span>
                        </div>
                        {lead.followup_due_date && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Follow-up</span>
                            <span className="font-medium">{new Date(lead.followup_due_date).toLocaleDateString()}</span>
                          </div>
                        )}
                        {lead.last_message && (
                          <div>
                            <span className="text-muted-foreground block mb-1">Last Message</span>
                            <p className="text-xs bg-muted/50 rounded p-2">{lead.last_message}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Name</TableHead>
                    <TableHead className="w-[130px]">Phone</TableHead>
                    <TableHead className="w-[140px]">Product</TableHead>
                    <TableHead className="w-[240px]">Remark</TableHead>
                    <TableHead className="w-[140px]">Source</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[110px]">Follow-up</TableHead>
                    <TableHead className="w-[100px]">Created</TableHead>
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
                      <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50 align-top">
                        <TableCell className="max-w-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                              {lead.full_name?.split(" ").map((n) => n[0]).join("").substring(0, 2) || "?"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{lead.full_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {lead.last_message || "No messages"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate">{lead.phone || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm block truncate" title={lead.product || ""}>{lead.product || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm block truncate" title={lead.remark || ""}>{lead.remark || "No Inquiry"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm block truncate" title={lead.source || lead.connected_pages?.page_name || ""}>{lead.source || lead.connected_pages?.page_name || "—"}</span>
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
    </div>
  );
}
