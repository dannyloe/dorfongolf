import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PresetPlayer {
  name: string;
  claimedByUserId: string | null;
  claimedByName: string | null;
}

interface ClaimPresetPlayerModalProps {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  currentPresetName: string | null;
}

export function ClaimPresetPlayerModal({ 
  open, 
  onClose, 
  currentUserId,
  currentPresetName 
}: ClaimPresetPlayerModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedName, setSelectedName] = useState<string | null>(currentPresetName);

  // Reset selection when modal opens or currentPresetName changes
  useEffect(() => {
    if (open) {
      setSelectedName(currentPresetName);
    }
  }, [open, currentPresetName]);

  const { data: presetPlayers, isLoading, refetch } = useQuery<PresetPlayer[]>({
    queryKey: ["/api/preset-players"],
    enabled: open,
  });

  // Refetch when modal opens
  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  const claimMutation = useMutation({
    mutationFn: async (presetPlayerName: string | null) => {
      const res = await apiRequest("POST", "/api/preset-players/claim", { presetPlayerName });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to claim name");
      }
      return res.json();
    },
    onSuccess: async () => {
      // Wait for auth to refresh before closing
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/preset-players"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Could not claim name",
        description: error.message,
        variant: "destructive",
      });
      // Refetch to get updated claim status
      refetch();
    },
  });

  const handleSave = () => {
    claimMutation.mutate(selectedName);
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Select Your Player Name
          </DialogTitle>
          <DialogDescription>
            Choose your name from the roster so we can identify you in matches. This helps auto-add you to events.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading roster...</div>
        ) : (
          <ScrollArea className="h-64 pr-4">
            <div className="grid grid-cols-2 gap-2">
              {presetPlayers?.map((player) => {
                const isClaimed = player.claimedByUserId !== null;
                const isClaimedByMe = player.claimedByUserId === currentUserId;
                const isSelected = selectedName === player.name;
                const isDisabled = isClaimed && !isClaimedByMe;

                return (
                  <button
                    key={player.name}
                    onClick={() => !isDisabled && setSelectedName(isSelected ? null : player.name)}
                    disabled={isDisabled}
                    className={`
                      flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors
                      ${isSelected 
                        ? 'bg-primary text-primary-foreground' 
                        : isDisabled
                          ? 'bg-muted/30 text-muted-foreground/50 cursor-not-allowed'
                          : 'bg-muted/50 hover:bg-muted'
                      }
                    `}
                    data-testid={`preset-player-${player.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <span className="truncate">{player.name}</span>
                    {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
                    {isDisabled && (
                      <span className="text-xs text-muted-foreground/50 truncate ml-1">
                        ({player.claimedByName})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button 
            variant="ghost" 
            onClick={handleSkip}
            data-testid="button-skip-preset"
          >
            Skip for now
          </Button>
          <Button 
            onClick={handleSave}
            disabled={claimMutation.isPending}
            data-testid="button-save-preset"
          >
            {claimMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
