import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, User, Plus } from "lucide-react";
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
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [aliasInput, setAliasInput] = useState("");

  // Reset selection when modal opens or currentPresetName changes
  useEffect(() => {
    if (open) {
      setSelectedName(currentPresetName);
      setIsAddingNew(false);
      setFirstName("");
      setLastName("");
      setDisplayName("");
      setAliasInput("");
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

  const createAndClaimMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; displayName: string; aliases?: string[] }) => {
      const res = await apiRequest("POST", "/api/preset-players/create-and-claim", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create profile");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/preset-players"] });
      toast({
        title: "Profile created",
        description: "Your name has been added to your account.",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Could not create profile",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (isAddingNew) {
      if (firstName.trim() && lastName.trim() && displayName.trim()) {
        // Parse aliases from comma-separated input
        const aliases = aliasInput
          .split(',')
          .map(a => a.trim())
          .filter(a => a.length > 0);
        
        createAndClaimMutation.mutate({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          displayName: displayName.trim(),
          aliases: aliases.length > 0 ? aliases : undefined,
        });
      }
    } else {
      claimMutation.mutate(selectedName);
    }
  };

  const isFormValid = isAddingNew 
    ? firstName.trim() && lastName.trim() && displayName.trim()
    : !!selectedName;

  const handleSkip = () => {
    onClose();
  };

  const isPending = claimMutation.isPending || createAndClaimMutation.isPending;

  const canClose = !!currentPresetName;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && canClose && onClose()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={canClose ? undefined : (e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            {currentPresetName ? "Change Your Player Name" : "Set Up Your Profile"}
          </DialogTitle>
          <DialogDescription>
            {currentPresetName 
              ? "Choose a different name from the roster or add a new one."
              : "Please select your name from the roster or add yourself to get started. This identifies you in matches."}
          </DialogDescription>
        </DialogHeader>

        {isAddingNew ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">First Name</label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  data-testid="input-first-name"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Last Name</label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Display Name</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., JT, Big Mike, Coach"
                data-testid="input-display-name"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                This is how you'll appear in matches and leaderboards
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nicknames (optional)</label>
              <Input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                placeholder="e.g., Johnny, JS, Smitty"
                data-testid="input-aliases"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Separate multiple nicknames with commas. These help match you to scores.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAddingNew(false);
                setFirstName("");
                setLastName("");
                setDisplayName("");
                setAliasInput("");
              }}
              data-testid="button-back-to-roster"
            >
              Back to roster
            </Button>
          </div>
        ) : isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading roster...</div>
        ) : (
          <>
            <ScrollArea className="h-52 pr-4">
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
            <div className="border-t pt-3 mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAddingNew(true);
                  setSelectedName(null);
                }}
                className="w-full"
                data-testid="button-add-new-name"
              >
                <Plus className="w-4 h-4 mr-2" />
                Not on the list? Add your name
              </Button>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-4">
          {currentPresetName && (
            <Button 
              variant="ghost" 
              onClick={handleSkip}
              data-testid="button-skip-preset"
            >
              Cancel
            </Button>
          )}
          <Button 
            onClick={handleSave}
            disabled={isPending || !isFormValid}
            data-testid="button-save-preset"
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
