import { useState } from "react";
import {
  Search,
  Filter,
  Send,
  Paperclip,
  Image,
  MoreVertical,
  Tag,
  User,
  StickyNote,
  ChevronDown,
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

// Mock conversations
const mockConversations = [
  {
    id: "1",
    participant_name: "John Smith",
    page_name: "Main Store",
    last_message: "When will my order arrive? I've been waiting for 3 days now.",
    last_message_at: "2 min ago",
    status: "unreplied",
    tags: ["urgent"],
  },
  {
    id: "2",
    participant_name: "Sarah Johnson",
    page_name: "Support",
    last_message: "Thank you so much for your help!",
    last_message_at: "15 min ago",
    status: "replied",
    tags: [],
  },
  {
    id: "3",
    participant_name: "Mike Davis",
    page_name: "Main Store",
    last_message: "Do you have the blue variant in stock?",
    last_message_at: "32 min ago",
    status: "unreplied",
    tags: ["product-inquiry"],
  },
  {
    id: "4",
    participant_name: "Emma Wilson",
    page_name: "Sales",
    last_message: "I'd like to place a bulk order for 500 units",
    last_message_at: "1 hour ago",
    status: "lead",
    tags: ["hot-lead", "bulk"],
  },
  {
    id: "5",
    participant_name: "Alex Chen",
    page_name: "Main Store",
    last_message: "My phone number is 09123456789",
    last_message_at: "2 hours ago",
    status: "lead",
    tags: ["lead-created"],
  },
];

const mockMessages = [
  { id: "1", content: "Hi! I placed an order last week.", sender_type: "customer", time: "10:30 AM" },
  { id: "2", content: "Hello! Let me check your order status.", sender_type: "page", time: "10:32 AM" },
  { id: "3", content: "I can see your order #12345 is on the way.", sender_type: "page", time: "10:33 AM" },
  { id: "4", content: "When will my order arrive? I've been waiting for 3 days now.", sender_type: "customer", time: "10:45 AM" },
];

const filterOptions = [
  { value: "all", label: "All Messages" },
  { value: "unreplied", label: "Unreplied" },
  { value: "replied", label: "Replied" },
  { value: "lead", label: "Leads" },
  { value: "follow-up", label: "Needs Follow-up" },
];

export default function Inbox() {
  const [selectedConversation, setSelectedConversation] = useState(mockConversations[0]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = mockConversations.filter((conv) => {
    if (filter !== "all" && conv.status !== filter) return false;
    if (searchQuery && !conv.participant_name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const handleSend = () => {
    if (!message.trim()) return;
    // In production, this would send via Graph API
    setMessage("");
  };

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Inbox"
        description="Manage all your conversations in one place"
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
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={cn(
                  "conversation-item",
                  selectedConversation?.id === conv.id && "conversation-item-active"
                )}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                  {conv.participant_name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{conv.participant_name}</p>
                    <span className="flex-shrink-0 text-xs text-muted-foreground">
                      {conv.last_message_at}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{conv.page_name}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {conv.last_message}
                  </p>
                  {conv.tags.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {conv.tags.map((tag) => (
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
            ))}
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
                    {selectedConversation.participant_name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <h3 className="font-semibold">{selectedConversation.participant_name}</h3>
                    <p className="text-xs text-muted-foreground">
                      via {selectedConversation.page_name}
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
                      <DropdownMenuItem>Create Lead</DropdownMenuItem>
                      <DropdownMenuItem>Mark as Follow-up</DropdownMenuItem>
                      <DropdownMenuItem>Archive</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages */}
              <div className="custom-scrollbar flex-1 overflow-y-auto p-6 space-y-4">
                {mockMessages.map((msg) => (
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
                        msg.sender_type === "page" ? "message-outgoing" : "message-incoming"
                      )}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className={cn(
                        "mt-1 text-xs",
                        msg.sender_type === "page" ? "text-primary-foreground/70" : "text-muted-foreground"
                      )}>
                        {msg.time}
                      </p>
                    </div>
                  </div>
                ))}
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
                      <Button variant="ghost" size="sm">
                        <StickyNote className="mr-1 h-4 w-4" />
                        Add Note
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Templates
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem>Greeting</DropdownMenuItem>
                          <DropdownMenuItem>Order Status</DropdownMenuItem>
                          <DropdownMenuItem>Follow-up</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <Button onClick={handleSend} size="lg">
                    <Send className="mr-2 h-4 w-4" />
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Select a conversation to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
