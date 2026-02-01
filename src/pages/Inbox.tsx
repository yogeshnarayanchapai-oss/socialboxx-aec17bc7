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
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  type Conversation,
} from "@/hooks/useConversations";
import { useConnectedPages } from "@/hooks/usePages";
import { useCreateLead } from "@/hooks/useLeads";
import { useReplyTemplates } from "@/hooks/useAutomation";
import { EmptyState } from "@/components/ui/EmptyState";

const filterOptions = [
  { value: "all", label: "All Messages" },
  { value: "unreplied", label: "Unreplied" },
  { value: "replied", label: "Replied" },
  { value: "lead", label: "Leads" },
  { value: "follow-up", label: "Needs Follow-up" },
];

export default function Inbox() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

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

  // Enable realtime updates
  useRealtimeConversations();

  // Select first conversation by default
  useEffect(() => {
    if (conversations.length > 0 && !selectedConversation) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations, selectedConversation]);

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

    const lastCustomerMessage = messages
      .filter(m => m.sender_type === "customer")
      .pop();

    if (!lastCustomerMessage) {
      toast.error("No customer message to respond to");
      return;
    }

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
      await addNote.mutateAsync({
        conversationId: selectedConversation.id,
        content: noteContent,
      });
      toast.success("Note added!");
    } catch (error) {
      toast.error("Failed to add note");
    }
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
    } catch (error) {
      toast.error("Failed to create lead");
    }
  };

  const handleMarkFollowUp = async () => {
    if (!selectedConversation) return;

    try {
      await updateConversation.mutateAsync({
        conversationId: selectedConversation.id,
        updates: { status: "follow-up" },
      });
      toast.success("Marked for follow-up!");
    } catch (error) {
      toast.error("Failed to update conversation");
    }
  };

  const handleRefreshConversations = async () => {
    if (pages.length === 0) {
      toast.error("No pages connected");
      return;
    }

    try {
      for (const page of pages) {
        await fetchConversations.mutateAsync(page.id);
      }
      toast.success("Conversations refreshed!");
    } catch (error) {
      toast.error("Failed to refresh conversations");
    }
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

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Inbox"
        description="Manage all your conversations in one place"
        action={
          <Button variant="outline" onClick={handleRefreshConversations} disabled={fetchConversations.isPending}>
            {fetchConversations.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Messages
          </Button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation List */}
        <div className="w-96 flex-shrink-0 border-r border-border bg-card">
          {/* Search & Filter */}
          <div className="border-b border-border p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {filterOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "filter-chip whitespace-nowrap",
                    filter === opt.value && "filter-chip-active"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation List */}
          <div className="custom-scrollbar overflow-y-auto" style={{ height: "calc(100vh - 200px)" }}>
            {loadingConversations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <p>No conversations yet</p>
                <p className="text-sm mt-1">Connect a page and sync messages to get started</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={cn(
                    "conversation-item",
                    selectedConversation?.id === conv.id && "conversation-item-active"
                  )}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                    {conv.participant_name?.split(" ").map((n) => n[0]).join("").substring(0, 2) || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{conv.participant_name || "Unknown"}</p>
                      <span className="flex-shrink-0 text-xs text-muted-foreground">
                        {conv.last_message_at ? formatTime(conv.last_message_at) : ""}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {conv.connected_pages?.page_name || "Unknown Page"}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {conv.last_message_preview || "No messages"}
                    </p>
                    {conv.tags && conv.tags.length > 0 && (
                      <div className="mt-2 flex gap-1">
                        {conv.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {conv.status === "unreplied" && (
                    <div className="h-2 w-2 flex-shrink-0 rounded-full bg-warning" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Conversation View */}
        <div className="flex flex-1 flex-col bg-background">
          {selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                    {selectedConversation.participant_name?.split(" ").map((n) => n[0]).join("").substring(0, 2) || "?"}
                  </div>
                  <div>
                    <h3 className="font-semibold">{selectedConversation.participant_name || "Unknown"}</h3>
                    <p className="text-xs text-muted-foreground">
                      via {selectedConversation.connected_pages?.page_name || "Unknown Page"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Tag className="mr-2 h-4 w-4" />
                    Tags
                  </Button>
                  <Button variant="outline" size="sm">
                    <User className="mr-2 h-4 w-4" />
                    Assign
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleCreateLead}>Create Lead</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleMarkFollowUp}>Mark as Follow-up</DropdownMenuItem>
                      <DropdownMenuItem>Archive</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages */}
              <div className="custom-scrollbar flex-1 overflow-y-auto p-6 space-y-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No messages in this conversation
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.sender_type === "page" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "message-bubble",
                          msg.is_internal_note 
                            ? "bg-warning/10 border border-warning/20 text-warning-foreground" 
                            : msg.sender_type === "page" 
                              ? "message-outgoing" 
                              : "message-incoming"
                        )}
                      >
                        {msg.is_internal_note && (
                          <p className="text-xs font-medium text-warning mb-1">📝 Internal Note</p>
                        )}
                        <p className="text-sm">{msg.content}</p>
                        {msg.media_url && (
                          <img src={msg.media_url} alt="Attachment" className="mt-2 max-w-xs rounded" />
                        )}
                        <p className={cn(
                          "mt-1 text-xs",
                          msg.sender_type === "page" && !msg.is_internal_note ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Reply Box */}
              <div className="border-t border-border p-4">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Textarea
                      placeholder="Type your message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="min-h-[80px] resize-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <Paperclip className="mr-1 h-4 w-4" />
                        Attach
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Image className="mr-1 h-4 w-4" />
                        Photo
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleAddNote}>
                        <StickyNote className="mr-1 h-4 w-4" />
                        Add Note
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleGetAISuggestion}
                        disabled={aiSuggestion.isPending}
                      >
                        {aiSuggestion.isPending ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1 h-4 w-4" />
                        )}
                        AI Suggest
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Templates
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {templates.length === 0 ? (
                            <DropdownMenuItem disabled>No templates available</DropdownMenuItem>
                          ) : (
                            templates.map((template) => (
                              <DropdownMenuItem 
                                key={template.id}
                                onClick={() => handleUseTemplate(template.content)}
                              >
                                {template.name}
                              </DropdownMenuItem>
                            ))
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <Button onClick={handleSend} size="lg" disabled={sendMessage.isPending || !message.trim()}>
                    {sendMessage.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Search}
              title="Select a conversation"
              description="Choose a conversation from the list to view messages"
            />
          )}
        </div>
      </div>
    </div>
  );
}
