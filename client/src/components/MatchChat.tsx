import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface Message {
  id: number;
  matchId: number | null;
  senderId: string;
  senderName: string | null;
  recipientId: string | null;
  content: string;
  readAt: string | null;
  createdAt: string;
}

interface MatchChatProps {
  matchId: number;
  currentUserId: string;
}

export default function MatchChat({ matchId, currentUserId }: MatchChatProps) {
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['/api/messages/match', matchId],
    enabled: isExpanded,
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest('POST', '/api/messages', { content, matchId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/match', matchId] });
      setNewMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    const trimmed = newMessage.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-2"
        data-testid="button-expand-chat"
      >
        <MessageCircle className="w-4 h-4" />
        Match Chat
      </Button>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          Match Chat
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(false)}
          data-testid="button-collapse-chat"
        >
          Minimize
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-48 rounded border bg-muted/30 p-3 mb-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet. Start the conversation!
            </p>
          ) : (
            <div className="space-y-3">
              {[...messages].reverse().map((msg) => {
                const isOwnMessage = msg.senderId === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOwnMessage ? "items-end" : "items-start"}`}
                    data-testid={`message-${msg.id}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        isOwnMessage
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {!isOwnMessage && (
                        <p className="font-semibold text-xs mb-1">{msg.senderName || "Unknown"}</p>
                      )}
                      <p>{msg.content}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(msg.createdAt), "MMM d, h:mm a")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-end gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="resize-none min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            data-testid="textarea-new-message"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!newMessage.trim() || sendMutation.isPending}
            data-testid="button-send-message"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
