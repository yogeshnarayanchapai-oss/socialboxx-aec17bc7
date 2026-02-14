import { useState, useEffect } from "react";
import {
  Search,
  Send,
  Paperclip,
  Image,
  MoreVertical,
  Tag,
  User,
  StickyNote,
  ChevronDown,
  Loader2,
  Sparkles,
  RefreshCw,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { 
  useConversations, 
  useConversationMessages, 
  useSendMessage, 
  useRealtimeConversations,
  useAISuggestion,
  useAddInternalNote,
  useUpdateConversation,
  useFetchConversations,
  useDeleteConversation,
  type Conversation,
} from "@/hooks/useConversations";
import { useConnectedPages } from "@/hooks/usePages";
import { useCreateLead } from "@/hooks/useLeads";
import { useReplyTemplates } from "@/hooks/useAutomation";
import { EmptyState } from "@/components/ui/EmptyState";
import { useIsMobile } from "@/hooks/use-mobile";

const filterOptions = [
  { value: "all", label: "All" },
  { value: "unreplied", label: "Unreplied" },
  { value: "replied", label: "Replied" },
  { value: "lead", label: "Leads" },
  { value: "follow-up", label: "Follow-up" },
];

export default function Inbox() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const { data: conversations = [], isLoading: loadingConversations } = useConversations({
    status: filter,
    search: searchQuery,
  });
  const { data: messages = [], isLoading: loadingMessages } = useConversationMessages(
    selectedConversation?.id || null
  );
  const { data: pages = [] } = useConnectedPages();
  const { data: templates = [] } = useReplyTemplates();
  
  const sendMessage = useSendMessage();
  const aiSuggestion = useAISuggestion();
  const addNote = useAddInternalNote();
  const updateConversation = useUpdateConversation();
  const createLead = useCreateLead();
  const fetchConversations = useFetchConversations();
  const deleteConversation = useDeleteConversation();

  useRealtimeConversations();

  useEffect(() => {
    if (!isMobile && conversations.length > 0 && !selectedConversation) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations, selectedConversation, isMobile]);

  const handleSend = async () => {
    if (!message.trim() || !selectedConversation) return;
    try {
      await sendMessage.mutateAsync({
        conversationId: selectedConversation.id,
        pageId: selectedConversation.page_id,
        recipientId: selectedConversation.participant_id || "",
        message: message.trim(),
      });
      setMessage("");
      toast.success("Message sent!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    }
  };

  const handleGetAISuggestion = async () => {
    if (!selectedConversation) return;
    const lastCustomerMessage = messages.filter(m => m.sender_type === "customer").pop();
    if (!lastCustomerMessage) { toast.error("No customer message to respond to"); return; }
    try {
      const result = await aiSuggestion.mutateAsync({
        conversationId: selectedConversation.id,
        customerMessage: lastCustomerMessage.content || "",
        conversationHistory: messages.map(m => `${m.sender_type}: ${m.content}`).join("\n"),
        pageName: selectedConversation.connected_pages?.page_name,
      });
      setMessage(result.suggestedReply);
      toast.success("AI suggestion generated!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to get AI suggestion");
    }
  };

  const handleAddNote = async () => {
    if (!selectedConversation) return;
    const noteContent = prompt("Enter internal note:");
    if (!noteContent) return;
    try {
      await addNote.mutateAsync({ conversationId: selectedConversation.id, content: noteContent });
      toast.success("Note added!");
    } catch { toast.error("Failed to add note"); }
  };

  const handleCreateLead = async () => {
    if (!selectedConversation) return;
    try {
      await createLead.mutateAsync({
        full_name: selectedConversation.participant_name,
        conversation_id: selectedConversation.id,
        page_id: selectedConversation.page_id,
        status: "new",
      });
      toast.success("Lead created!");
    } catch { toast.error("Failed to create lead"); }
  };

  const handleMarkFollowUp = async () => {
    if (!selectedConversation) return;
    try {
      await updateConversation.mutateAsync({
        conversationId: selectedConversation.id,
        updates: { status: "follow-up" },
      });
      toast.success("Marked for follow-up!");
    } catch { toast.error("Failed to update conversation"); }
  };

  const handleDeleteConversation = async () => {
    if (!conversationToDelete) return;
    try {
      await deleteConversation.mutateAsync(conversationToDelete);
      if (selectedConversation?.id === conversationToDelete) {
        setSelectedConversation(null);
      }
      toast.success("Conversation deleted!");
    } catch { toast.error("Failed to delete conversation"); }
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  };

  const handleRefreshConversations = async () => {
    if (pages.length === 0) { toast.error("No pages connected."); return; }
    try {
      for (const page of pages) { await fetchConversations.mutateAsync(page.id); }
      toast.success("Conversations synced!");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to sync"); }
  };

  const handleUseTemplate = (content: string) => {
    let processed = content
      .replace(/\{\{name\}\}/g, selectedConversation?.participant_name || "there")
      .replace(/\{\{page\}\}/g, selectedConversation?.connected_pages?.page_name || "");
    setMessage(processed);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const handleBack = () => setSelectedConversation(null);

  const isLeadConversation = (conv: Conversation) => {
    return conv.tags?.includes("lead-created");
  };

  const showConversationList = !isMobile || !selectedConversation;
  const showConversationView = !isMobile || selectedConversation;

  return (
    <div className="flex h-[calc(100vh-56px)] md:h-screen flex-col">
      <PageHeader title="Inbox" description="Manage all your conversations" />

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation List */}
        {showConversationList && (
          <div className={cn(
            "flex-shrink-0 border-r border-border bg-card",
            isMobile ? "w-full" : "w-80 lg:w-96"
          )}>
            <div className="border-b border-border p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-9 h-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {filterOptions.map((opt) => (
                  <button key={opt.value} onClick={() => setFilter(opt.value)}
                    className={cn("filter-chip whitespace-nowrap text-xs", filter === opt.value && "filter-chip-active")}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="custom-scrollbar overflow-y-auto" style={{ height: "calc(100% - 90px)" }}>
              {loadingConversations ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <p>No conversations yet</p>
                  <p className="text-sm mt-1">Connect a page and sync messages</p>
                </div>
              ) : (
                conversations.map((conv) => {
                  const isLead = isLeadConversation(conv);
                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={cn(
                        "conversation-item relative",
                        selectedConversation?.id === conv.id && "conversation-item-active",
                        isLead ? "bg-green-500/5 hover:bg-green-500/10" : "hover:bg-muted/50"
                      )}
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {conv.participant_name?.split(" ").map((n) => n[0]).join("").substring(0, 2) || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="truncate font-medium text-sm">{conv.participant_name || "Unknown"}</p>
                            {isLead && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-green-600 hover:bg-green-600 flex-shrink-0">
                                LEAD
                              </Badge>
                            )}
                          </div>
                          <span className="flex-shrink-0 text-xs text-muted-foreground">
                            {conv.last_message_at ? formatTime(conv.last_message_at) : ""}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.connected_pages?.page_name || "Unknown Page"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {conv.last_message_preview || "No messages"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {conv.status === "unreplied" && (
                          <div className="h-2 w-2 rounded-full bg-warning" />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConversationToDelete(conv.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Conversation View */}
        {showConversationView && (
          <div className={cn("flex flex-1 flex-col bg-background", isMobile && !selectedConversation && "hidden")}>
            {selectedConversation ? (
              <>
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {isMobile && (
                      <Button variant="ghost" size="icon" onClick={handleBack}><ArrowLeft className="h-5 w-5" /></Button>
                    )}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                      {selectedConversation.participant_name?.split(" ").map((n) => n[0]).join("").substring(0, 2) || "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{selectedConversation.participant_name || "Unknown"}</h3>
                        {isLeadConversation(selectedConversation) && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-green-600 hover:bg-green-600">LEAD</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        via {selectedConversation.connected_pages?.page_name || "Unknown Page"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleCreateLead}>Create Lead</DropdownMenuItem>
                        <DropdownMenuItem onClick={handleMarkFollowUp}>Mark as Follow-up</DropdownMenuItem>
                        <DropdownMenuItem>Archive</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setConversationToDelete(selectedConversation.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          Delete Conversation
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Messages */}
                <div className="custom-scrollbar flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">No messages in this conversation</div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={cn("flex", msg.sender_type === "page" ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "message-bubble max-w-[85%] sm:max-w-[70%]",
                          msg.is_internal_note 
                            ? "bg-warning/10 border border-warning/20 text-warning-foreground" 
                            : msg.sender_type === "page" ? "message-outgoing" : "message-incoming"
                        )}>
                          {msg.is_internal_note && <p className="text-xs font-medium text-warning mb-1">📝 Note</p>}
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          {msg.media_url && <img src={msg.media_url} alt="Attachment" className="mt-2 max-w-full rounded" />}
                          <p className={cn("mt-1 text-xs", msg.sender_type === "page" && !msg.is_internal_note ? "text-primary-foreground/70" : "text-muted-foreground")}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Reply Box */}
                <div className="border-t border-border p-3">
                  <div className="flex flex-col gap-2">
                    <Textarea
                      placeholder="Type your message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="min-h-[60px] resize-none"
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 overflow-x-auto">
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><Paperclip className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><Image className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={handleAddNote} className="h-8 w-8 flex-shrink-0"><StickyNote className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={handleGetAISuggestion} disabled={aiSuggestion.isPending} className="h-8 w-8 flex-shrink-0">
                          {aiSuggestion.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 text-xs flex-shrink-0">
                              Templates<ChevronDown className="ml-1 h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {templates.length === 0 ? (
                              <DropdownMenuItem disabled>No templates</DropdownMenuItem>
                            ) : (
                              templates.map((template) => (
                                <DropdownMenuItem key={template.id} onClick={() => handleUseTemplate(template.content)}>
                                  {template.name}
                                </DropdownMenuItem>
                              ))
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <Button onClick={handleSend} size="sm" disabled={sendMessage.isPending || !message.trim()} className="flex-shrink-0">
                        {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState icon={Search} title="Select a conversation" description="Choose a conversation from the list to view messages" />
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The conversation will be removed from all lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConversation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
