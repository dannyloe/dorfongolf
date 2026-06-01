import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, UserPlus, Copy, Shield, RefreshCw, Check, X, ArrowLeft, Plus, Trash2, Share2, Search, Phone, PhoneOff, Link2, Loader2, AlertTriangle, Unlink, Ghost, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface GroupSummary {
  id: number;
  name: string;
  description: string | null;
  inviteCode: string | null;
  createdBy: string;
  memberCount: number;
  playerCount: number;
  role: string;
}

interface GroupMember {
  userId: string;
  role: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    profileImageUrl: string | null;
    phone: string | null;
    phoneVerified: boolean | null;
  } | null;
}

interface GroupDetail {
  id: number;
  name: string;
  description: string | null;
  inviteCode: string | null;
  createdBy: string;
  members: GroupMember[];
  players: Array<{ id: number; presetPlayerId: number; presetPlayer?: { id: number; name: string } }>;
  pendingRequests: Array<{
    id: number;
    userId: string;
    status: string;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    } | null;
  }>;
  role: string;
}

interface PresetPlayer {
  id: number;
  name: string;
  claimedByUserId: string | null;
  claimedByName: string | null;
  aliases: string[];
}

interface GuestPlayer {
  id: number;
  name: string;
  isAutoCreated: boolean;
  lastActivityAt: string | null;
  matchCount: number;
}

interface GroupPairings {
  linkedPairs: Array<{
    presetPlayer: { id: number; name: string; userId: string | null };
    user: { id: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null };
  }>;
  unlinkedUsers: Array<{ id: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null }>;
  unlinkedPlayers: Array<{ id: number; name: string }>;
  brokenLegacyLinks: Array<{ userId: string; presetPlayerName: string; firstName: string | null; lastName: string | null }>;
}

export default function Groups() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
  const [playerFilter, setPlayerFilter] = useState<'all' | 'registered' | 'unregistered'>('all');
  const [pairPlayerIdForUser, setPairPlayerIdForUser] = useState<Record<string, number | null>>({});
  const [pairUserIdForPlayer, setPairUserIdForPlayer] = useState<Record<number, string | null>>({});
  const [guestPlayersExpanded, setGuestPlayersExpanded] = useState(false);
  const [guestDeleteConfirmId, setGuestDeleteConfirmId] = useState<number | null>(null);
  const [guestDeleteConfirmName, setGuestDeleteConfirmName] = useState<string>("");
  const [guestDeleteHasHistory, setGuestDeleteHasHistory] = useState(false);

  const { data: myGroups = [], isLoading: groupsLoading } = useQuery<GroupSummary[]>({
    queryKey: ["/api/groups/my"],
    queryFn: async () => {
      const res = await fetch("/api/groups/my", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
  });

  const { data: groupDetail, isLoading: detailLoading } = useQuery<GroupDetail>({
    queryKey: ["/api/groups", selectedGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${selectedGroupId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch group detail");
      return res.json();
    },
    enabled: !!selectedGroupId,
  });

  const isAdmin = groupDetail?.role === "admin";
  const isGlobalAdmin = user?.isAdmin ?? false;

  const { data: allPresetPlayers = [] } = useQuery<PresetPlayer[]>({
    queryKey: ["/api/preset-players"],
    queryFn: async () => {
      const res = await fetch("/api/preset-players", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch preset players");
      return res.json();
    },
    enabled: !!selectedGroupId,
  });

  const { data: groupPairings, isLoading: pairingsLoading } = useQuery<GroupPairings>({
    queryKey: ["/api/groups", selectedGroupId, "pairings"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${selectedGroupId}/pairings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pairings");
      return res.json();
    },
    enabled: !!selectedGroupId && isAdmin,
  });

  const { data: guestPlayers = [] } = useQuery<GuestPlayer[]>({
    queryKey: ["/api/groups", selectedGroupId, "guest-players"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${selectedGroupId}/guest-players`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch guest players");
      return res.json();
    },
    enabled: !!selectedGroupId && isGlobalAdmin,
  });

  const promoteGuestMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PATCH", `/api/preset-players/${id}/show`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId, "guest-players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId] });
      toast({ title: "Player added to roster" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteGuestMutation = useMutation({
    mutationFn: async ({ id, force }: { id: number; force: boolean }) => {
      const res = await fetch(`/api/preset-players/${id}${force ? "?force=true" : ""}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.message || "Player has history") as any;
        err.hasHistory = true;
        throw err;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId, "guest-players"] });
      setGuestDeleteConfirmId(null);
      setGuestDeleteConfirmName("");
      setGuestDeleteHasHistory(false);
      toast({ title: "Guest player deleted" });
    },
    onError: (err: any) => {
      if (err.hasHistory) {
        setGuestDeleteHasHistory(true);
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });

  const pairMutation = useMutation({
    mutationFn: async ({ presetPlayerId, userId }: { presetPlayerId: number; userId: string }) => {
      return apiRequest("POST", `/api/groups/${selectedGroupId}/players/${presetPlayerId}/pair`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId, "pairings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players"] });
      toast({ title: "Paired", description: "Player linked to user account." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const unpairMutation = useMutation({
    mutationFn: async (presetPlayerId: number) => {
      return apiRequest("DELETE", `/api/groups/${selectedGroupId}/players/${presetPlayerId}/pair`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId, "pairings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players"] });
      toast({ title: "Unpaired", description: "Player unlinked from user account." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/groups", {
        name: newGroupName,
        description: newGroupDescription || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      setCreateDialogOpen(false);
      setNewGroupName("");
      setNewGroupDescription("");
      toast({ title: "Group created", description: "Your new group has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/groups/join", { inviteCode: inviteCodeInput });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      setJoinDialogOpen(false);
      setInviteCodeInput("");
      toast({ title: "Joined group", description: "You have successfully joined the group." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const regenerateCodeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/groups/${selectedGroupId}/invite-code`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId] });
      toast({ title: "Code regenerated", description: "A new invite code has been generated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/groups/${selectedGroupId}/members/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId] });
      toast({ title: "Role updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/groups/${selectedGroupId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      toast({ title: "Member removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addPlayerMutation = useMutation({
    mutationFn: async (presetPlayerIds: number[]) => {
      const res = await apiRequest("POST", `/api/groups/${selectedGroupId}/players/bulk`, { presetPlayerIds });
      const results = await res.json();
      return { results, requested: presetPlayerIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      const added = data.results.length;
      const failed = data.requested - added;
      if (failed > 0 && added > 0) {
        toast({ title: `${added} player${added === 1 ? '' : 's'} added`, description: `${failed} could not be added (may already be in group).` });
      } else if (added > 0) {
        toast({ title: `${added} player${added === 1 ? '' : 's'} added` });
      } else {
        toast({ title: "No players added", description: "They may already be in the group.", variant: "destructive" });
      }
      setAddMemberDialogOpen(false);
      resetAddMemberForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removePlayerMutation = useMutation({
    mutationFn: async (presetPlayerId: number) => {
      return apiRequest("DELETE", `/api/groups/${selectedGroupId}/players/${presetPlayerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      toast({ title: "Player removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resolveRequestMutation = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: number; status: string }) => {
      return apiRequest("PATCH", `/api/groups/${selectedGroupId}/join-requests/${requestId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      toast({ title: "Request resolved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const invitePlayerMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await apiRequest("POST", `/api/groups/${selectedGroupId}/players/invite`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players"] });
      toast({
        title: "Member added",
        description: "Player added to group.",
      });
      setAddMemberDialogOpen(false);
      resetAddMemberForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetAddMemberForm = () => {
    setPlayerSearchQuery("");
    setSelectedPlayerIds(new Set());
  };

  const togglePlayerSelection = (playerId: number) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const handleAddSelectedPlayers = () => {
    if (selectedPlayerIds.size === 0) return;
    addPlayerMutation.mutate(Array.from(selectedPlayerIds));
  };

  const handleCreateNewPlayer = () => {
    if (playerSearchQuery.trim()) {
      invitePlayerMutation.mutate({ name: playerSearchQuery.trim() });
    }
  };

  const handleCopyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      toast({ title: "Copied", description: "Invite code copied to clipboard." });
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast({ title: "Error", description: "Failed to copy code.", variant: "destructive" });
    }
  };

  const handleShareInvite = async () => {
    if (!groupDetail) return;
    const code = groupDetail.inviteCode || '';
    const text = `Join my group "${groupDetail.name}" on Golf Betting! Use invite code: ${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${groupDetail.name}`, text });
      } catch {
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied", description: "Invite message copied to clipboard. Share it with your friends!" });
      } catch {
        toast({ title: "Error", description: "Could not share invite.", variant: "destructive" });
      }
    }
  };

  const [sharingSetupLinkFor, setSharingSetupLinkFor] = useState<string | null>(null);

  const handleShareSetupLink = async (targetUserId: string, targetName: string) => {
    if (!selectedGroupId) return;
    setSharingSetupLinkFor(targetUserId);
    try {
      const res = await apiRequest("POST", `/api/users/${targetUserId}/phone-setup-token`, {});
      const { token } = await res.json();
      const url = `${window.location.origin}/phone-setup?t=${token}`;
      const text = `${targetName}, set up your phone to get Golf Betting match alerts: ${url}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: "Golf Betting Phone Setup", text });
        } catch {
        }
      } else {
        try {
          await navigator.clipboard.writeText(text);
          toast({ title: "Copied", description: "Setup link copied to clipboard." });
        } catch {
          toast({ title: "Error", description: "Could not copy link.", variant: "destructive" });
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to generate setup link.", variant: "destructive" });
    } finally {
      setSharingSetupLinkFor(null);
    }
  };

  const getInitials = (firstName: string | null, lastName: string | null, email: string | null) => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (firstName) return firstName[0].toUpperCase();
    if (email) return email[0].toUpperCase();
    return "?";
  };

  const existingPlayerIds = new Set(groupDetail?.players.map(p => p.presetPlayerId) ?? []);
  const availablePlayers = allPresetPlayers.filter(p => !existingPlayerIds.has(p.id));

  const filteredAvailablePlayers = availablePlayers.filter(p => {
    const query = playerSearchQuery.toLowerCase().trim();
    if (!query) return true;
    if (p.name.toLowerCase().includes(query)) return true;
    if (p.claimedByName && p.claimedByName.toLowerCase().includes(query)) return true;
    if (p.aliases?.some(alias => alias.toLowerCase().includes(query))) return true;
    return false;
  });
  const showCreateNew = playerSearchQuery.trim().length > 0 &&
    !availablePlayers.some(p => {
      const query = playerSearchQuery.toLowerCase().trim();
      return p.name.toLowerCase() === query ||
        (p.claimedByName && p.claimedByName.toLowerCase() === query) ||
        p.aliases?.some(alias => alias.toLowerCase() === query);
    });

  const memberUserIds = new Set(groupDetail?.members.map(m => m.userId) ?? []);
  const registeredPlayers = groupDetail?.members ?? [];
  const unregisteredPlayers = (groupDetail?.players ?? []).filter(p => {
    const presetPlayer = allPresetPlayers.find(pp => pp.id === p.presetPlayerId);
    if (presetPlayer?.claimedByUserId && memberUserIds.has(presetPlayer.claimedByUserId)) {
      return false;
    }
    return true;
  });
  const totalPlayerCount = registeredPlayers.length + unregisteredPlayers.length;

  if (selectedGroupId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedGroupId(null)}
            data-testid="button-back-to-groups"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold font-display" data-testid="text-group-name">
              {groupDetail?.name ?? "Loading..."}
            </h1>
            {groupDetail?.description && (
              <p className="text-muted-foreground mt-1" data-testid="text-group-description">
                {groupDetail.description}
              </p>
            )}
          </div>
        </div>

        {isAdmin && groupDetail?.inviteCode && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">Invite Code:</span>
                <div className="flex items-center gap-2 bg-muted px-4 py-2 rounded-md font-mono text-sm" data-testid="text-invite-code">
                  {groupDetail.inviteCode}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyInviteCode(groupDetail.inviteCode!)}
                  data-testid="button-copy-invite-code"
                >
                  {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShareInvite}
                  data-testid="button-share-invite"
                >
                  <Share2 className="w-4 h-4 mr-1" />
                  Share Invite
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => regenerateCodeMutation.mutate()}
                  disabled={regenerateCodeMutation.isPending}
                  data-testid="button-regenerate-code"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {detailLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Tabs defaultValue="players">
            <TabsList>
              <TabsTrigger value="players" data-testid="tab-players">Players</TabsTrigger>
              {isAdmin && <TabsTrigger value="pairings" data-testid="tab-pairings">Pairings</TabsTrigger>}
              {isAdmin && <TabsTrigger value="requests" data-testid="tab-requests">Join Requests</TabsTrigger>}
            </TabsList>

            <TabsContent value="players" className="space-y-4 mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={playerFilter === 'all' ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setPlayerFilter('all')}
                  data-testid="filter-all"
                >
                  All ({totalPlayerCount})
                </Badge>
                <Badge
                  variant={playerFilter === 'registered' ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setPlayerFilter('registered')}
                  data-testid="filter-registered"
                >
                  Players ({registeredPlayers.length})
                </Badge>
                <Badge
                  variant={playerFilter === 'unregistered' ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setPlayerFilter('unregistered')}
                  data-testid="filter-unregistered"
                >
                  Unregistered ({unregisteredPlayers.length})
                </Badge>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() => setAddMemberDialogOpen(true)}
                    className="ml-auto"
                    data-testid="button-add-member"
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Add Player
                  </Button>
                )}
              </div>

              {(playerFilter === 'all' || playerFilter === 'registered') && groupDetail?.members.map((member) => (
                <Card key={`member-${member.userId}`} data-testid={`card-member-${member.userId}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Avatar className="border-2 border-primary/30">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {getInitials(
                              member.user?.firstName ?? null,
                              member.user?.lastName ?? null,
                              member.user?.email ?? null
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium" data-testid={`text-member-name-${member.userId}`}>
                            {member.user?.firstName
                              ? `${member.user.firstName} ${member.user.lastName ?? ""}`.trim()
                              : member.user?.email ?? member.userId}
                          </p>
                          {member.user?.email && (
                            <p className="text-xs text-muted-foreground">{member.user.email}</p>
                          )}
                          {isAdmin && member.user && (
                            <div className="flex items-center gap-1 mt-0.5" data-testid={`phone-status-${member.userId}`}>
                              {member.user.phone && member.user.phoneVerified ? (
                                <>
                                  <Phone className="w-3 h-3 text-emerald-500" />
                                  <span className="text-xs text-emerald-600 font-medium">{member.user.phone}</span>
                                </>
                              ) : member.user.phone && !member.user.phoneVerified ? (
                                <>
                                  <PhoneOff className="w-3 h-3 text-amber-500" />
                                  <span className="text-xs text-amber-600">Unverified</span>
                                </>
                              ) : (
                                <>
                                  <PhoneOff className="w-3 h-3 text-muted-foreground/50" />
                                  <span className="text-xs text-muted-foreground">No phone</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={member.role === "admin" ? "default" : "secondary"} className="text-xs" data-testid={`badge-role-${member.userId}`}>
                          {member.role === "admin" ? (
                            <><Shield className="w-3 h-3 mr-1" />Admin</>
                          ) : (
                            "Player"
                          )}
                        </Badge>
                        {member.userId === groupDetail?.createdBy && (
                          <Badge variant="outline" className="text-xs">Creator</Badge>
                        )}
                        {isAdmin && member.user && !member.user.phoneVerified && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={sharingSetupLinkFor === member.userId}
                            onClick={() => {
                              const name = member.user?.firstName
                                ? `${member.user.firstName} ${member.user.lastName ?? ""}`.trim()
                                : member.user?.email ?? "them";
                              handleShareSetupLink(member.userId, name);
                            }}
                            data-testid={`button-share-setup-${member.userId}`}
                          >
                            {sharingSetupLinkFor === member.userId
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Link2 className="w-3 h-3" />}
                            Share setup link
                          </Button>
                        )}
                        {isAdmin && member.userId !== user?.id && member.userId !== groupDetail?.createdBy && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                updateRoleMutation.mutate({
                                  userId: member.userId,
                                  role: member.role === "admin" ? "member" : "admin",
                                })
                              }
                              disabled={updateRoleMutation.isPending}
                              data-testid={`button-toggle-role-${member.userId}`}
                            >
                              {member.role === "admin" ? "Demote" : "Promote"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeMemberMutation.mutate(member.userId)}
                              disabled={removeMemberMutation.isPending}
                              data-testid={`button-remove-member-${member.userId}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {(playerFilter === 'all' || playerFilter === 'unregistered') && unregisteredPlayers.map((player) => (
                <Card key={`player-${player.presetPlayerId}`} className="border-dashed" data-testid={`card-player-${player.presetPlayerId}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Avatar className="border-2 border-muted-foreground/20">
                          <AvatarFallback className="bg-muted text-muted-foreground">
                            {(player.presetPlayer?.name ?? "?")[0]?.toUpperCase() ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium" data-testid={`text-player-name-${player.presetPlayerId}`}>
                            {player.presetPlayer?.name ?? "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">Not yet registered</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs border-dashed">Unregistered</Badge>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removePlayerMutation.mutate(player.presetPlayerId)}
                            disabled={removePlayerMutation.isPending}
                            data-testid={`button-remove-player-${player.presetPlayerId}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {totalPlayerCount === 0 && (
                <p className="text-muted-foreground text-center py-8">No players yet. Add some to get started.</p>
              )}

              {/* Guest Players section — global admin only */}
              {isGlobalAdmin && guestPlayers.length > 0 && (
                <div className="mt-4">
                  <button
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full py-2 px-1"
                    onClick={() => setGuestPlayersExpanded(v => !v)}
                    data-testid="button-toggle-guest-players"
                  >
                    <Ghost className="w-4 h-4" />
                    Inactive / Guest Players ({guestPlayers.length})
                    {guestPlayersExpanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                  </button>

                  {guestPlayersExpanded && (
                    <div className="space-y-2 mt-2">
                      <p className="text-xs text-muted-foreground px-1">
                        These players appeared in this group's matches but were never added to the roster.
                      </p>
                      {guestPlayers.map((gp) => (
                        <Card key={gp.id} className="border-dashed opacity-75" data-testid={`card-guest-${gp.id}`}>
                          <CardContent className="pt-3 pb-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <Ghost className="w-5 h-5 text-muted-foreground/50" />
                                <div>
                                  <p className="font-medium text-sm" data-testid={`text-guest-name-${gp.id}`}>{gp.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {gp.matchCount} match{gp.matchCount !== 1 ? "es" : ""} · Last active:{" "}
                                    {gp.lastActivityAt ? new Date(gp.lastActivityAt).toLocaleDateString() : "never"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => promoteGuestMutation.mutate(gp.id)}
                                  disabled={promoteGuestMutation.isPending}
                                  data-testid={`button-promote-guest-${gp.id}`}
                                >
                                  Add to Roster
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setGuestDeleteConfirmId(gp.id);
                                    setGuestDeleteConfirmName(gp.name);
                                    setGuestDeleteHasHistory(false);
                                    deleteGuestMutation.mutate({ id: gp.id, force: false });
                                  }}
                                  disabled={deleteGuestMutation.isPending}
                                  data-testid={`button-delete-guest-${gp.id}`}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {isAdmin && (
              <TabsContent value="pairings" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  Link user accounts to player names. This creates a permanent connection so renaming a player won't break the link.
                </p>

                {pairingsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Broken legacy links warning */}
                    {(groupPairings?.brokenLegacyLinks ?? []).length > 0 && (
                      <Card className="border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-2 mb-3">
                            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Broken legacy links</p>
                              <p className="text-xs text-muted-foreground">These users have a player name string set but no FK link. Use the pair button to fix.</p>
                            </div>
                          </div>
                          {groupPairings?.brokenLegacyLinks.map(bl => (
                            <div key={bl.userId} className="flex items-center gap-2 text-sm py-1" data-testid={`broken-link-${bl.userId}`}>
                              <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                              <span className="font-medium">{bl.firstName ? `${bl.firstName} ${bl.lastName ?? ''}`.trim() : bl.userId}</span>
                              <span className="text-muted-foreground">→ claimed "{bl.presetPlayerName}" (unconfirmed)</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    {/* Existing linked pairs */}
                    {(groupPairings?.linkedPairs ?? []).length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Linked Pairs</h3>
                        <div className="space-y-2">
                          {groupPairings?.linkedPairs.map(lp => (
                            <Card key={lp.presetPlayer.id} data-testid={`pair-${lp.presetPlayer.id}`}>
                              <CardContent className="pt-3 pb-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                      <Avatar className="w-7 h-7">
                                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                          {lp.presetPlayer.name[0].toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="font-medium text-sm">{lp.presetPlayer.name}</span>
                                    </div>
                                    <Check className="w-4 h-4 text-emerald-500" />
                                    <div className="flex items-center gap-2">
                                      <Avatar className="w-7 h-7">
                                        <AvatarFallback className="text-xs">
                                          {lp.user.firstName?.[0]?.toUpperCase() ?? '?'}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="text-sm">{lp.user.firstName ? `${lp.user.firstName} ${lp.user.lastName ?? ''}`.trim() : lp.user.id}</span>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => unpairMutation.mutate(lp.presetPlayer.id)}
                                    disabled={unpairMutation.isPending}
                                    data-testid={`button-unpair-${lp.presetPlayer.id}`}
                                  >
                                    <Unlink className="w-3.5 h-3.5 mr-1" />
                                    Unpair
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unlinked players: pick a user to pair */}
                    {(groupPairings?.unlinkedPlayers ?? []).length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Unlinked Players</h3>
                        <div className="space-y-2">
                          {groupPairings?.unlinkedPlayers.map(pp => (
                            <Card key={pp.id} className="border-dashed" data-testid={`unlinked-player-${pp.id}`}>
                              <CardContent className="pt-3 pb-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <Avatar className="w-7 h-7">
                                    <AvatarFallback className="text-xs bg-muted">{pp.name[0].toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-sm flex-1 min-w-0 truncate">{pp.name}</span>
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={pairUserIdForPlayer[pp.id] ?? ""}
                                      onValueChange={(val) => setPairUserIdForPlayer(prev => ({ ...prev, [pp.id]: val }))}
                                    >
                                      <SelectTrigger className="w-44 h-8 text-xs" data-testid={`select-user-for-player-${pp.id}`}>
                                        <SelectValue placeholder="Pick a user…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(groupPairings?.unlinkedUsers ?? []).map(u => (
                                          <SelectItem key={u.id} value={u.id}>
                                            {u.firstName ? `${u.firstName} ${u.lastName ?? ''}`.trim() : u.id}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      size="sm"
                                      className="h-8 text-xs"
                                      disabled={!pairUserIdForPlayer[pp.id] || pairMutation.isPending}
                                      onClick={() => {
                                        const uid = pairUserIdForPlayer[pp.id];
                                        if (uid) {
                                          pairMutation.mutate({ presetPlayerId: pp.id, userId: uid });
                                          setPairUserIdForPlayer(prev => ({ ...prev, [pp.id]: null }));
                                        }
                                      }}
                                      data-testid={`button-pair-player-${pp.id}`}
                                    >
                                      Pair
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unlinked users: pick a player to pair */}
                    {(groupPairings?.unlinkedUsers ?? []).length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Unlinked Members</h3>
                        <div className="space-y-2">
                          {groupPairings?.unlinkedUsers.map(u => (
                            <Card key={u.id} className="border-dashed" data-testid={`unlinked-user-${u.id}`}>
                              <CardContent className="pt-3 pb-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <Avatar className="w-7 h-7">
                                    <AvatarFallback className="text-xs">{u.firstName?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-sm flex-1 min-w-0 truncate">
                                    {u.firstName ? `${u.firstName} ${u.lastName ?? ''}`.trim() : u.id}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={pairPlayerIdForUser[u.id]?.toString() ?? ""}
                                      onValueChange={(val) => setPairPlayerIdForUser(prev => ({ ...prev, [u.id]: parseInt(val) }))}
                                    >
                                      <SelectTrigger className="w-44 h-8 text-xs" data-testid={`select-player-for-user-${u.id}`}>
                                        <SelectValue placeholder="Pick a player…" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(groupPairings?.unlinkedPlayers ?? []).map(pp => (
                                          <SelectItem key={pp.id} value={pp.id.toString()}>
                                            {pp.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      size="sm"
                                      className="h-8 text-xs"
                                      disabled={!pairPlayerIdForUser[u.id] || pairMutation.isPending}
                                      onClick={() => {
                                        const ppId = pairPlayerIdForUser[u.id];
                                        if (ppId) {
                                          pairMutation.mutate({ presetPlayerId: ppId, userId: u.id });
                                          setPairPlayerIdForUser(prev => ({ ...prev, [u.id]: null }));
                                        }
                                      }}
                                      data-testid={`button-pair-user-${u.id}`}
                                    >
                                      Pair
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {(groupPairings?.linkedPairs ?? []).length === 0 &&
                     (groupPairings?.unlinkedPlayers ?? []).length === 0 &&
                     (groupPairings?.unlinkedUsers ?? []).length === 0 && (
                      <p className="text-muted-foreground text-center py-8">No members or players in this group yet.</p>
                    )}
                  </div>
                )}
              </TabsContent>
            )}

            {isAdmin && (
              <TabsContent value="requests" className="space-y-3 mt-4">
                {groupDetail?.pendingRequests.filter(r => r.status === "pending").map((request) => (
                  <Card key={request.id} data-testid={`card-request-${request.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {getInitials(
                                request.user?.firstName ?? null,
                                request.user?.lastName ?? null,
                                request.user?.email ?? null
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium" data-testid={`text-request-name-${request.id}`}>
                              {request.user?.firstName
                                ? `${request.user.firstName} ${request.user.lastName ?? ""}`.trim()
                                : request.user?.email ?? request.userId}
                            </p>
                            {request.user?.email && (
                              <p className="text-sm text-muted-foreground">{request.user.email}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => resolveRequestMutation.mutate({ requestId: request.id, status: "approved" })}
                            disabled={resolveRequestMutation.isPending}
                            data-testid={`button-approve-request-${request.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resolveRequestMutation.mutate({ requestId: request.id, status: "rejected" })}
                            disabled={resolveRequestMutation.isPending}
                            data-testid={`button-reject-request-${request.id}`}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(groupDetail?.pendingRequests.filter(r => r.status === "pending").length ?? 0) === 0 && (
                  <p className="text-muted-foreground text-center py-8">No pending join requests.</p>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}

        <Dialog open={addMemberDialogOpen} onOpenChange={(open) => { if (!open) { resetAddMemberForm(); } setAddMemberDialogOpen(open); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Players</DialogTitle>
              {selectedPlayerIds.size > 0 && (
                <p className="text-sm text-muted-foreground">{selectedPlayerIds.size} selected</p>
              )}
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                  placeholder="Search by name..."
                  className="pl-9"
                  autoFocus
                  data-testid="input-player-search"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1" data-testid="list-player-results">
                {playerSearchQuery.trim() === "" && availablePlayers.length > 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">Select players to add, then confirm below.</p>
                )}
                {playerSearchQuery.trim() !== "" && filteredAvailablePlayers.length === 0 && !showCreateNew && (
                  <p className="text-sm text-muted-foreground text-center py-4">No players found.</p>
                )}
                {(playerSearchQuery.trim() === "" ? availablePlayers : filteredAvailablePlayers).map((p) => {
                  const isSelected = selectedPlayerIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlayerSelection(p.id)}
                      disabled={addPlayerMutation.isPending}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm hover-elevate active-elevate-2 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
                      data-testid={`button-select-player-${p.id}`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className="text-xs">{p.name[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span>{p.name}</span>
                      {p.claimedByUserId && (
                        <Badge variant="secondary" className="ml-auto text-xs">Registered</Badge>
                      )}
                    </button>
                  );
                })}
                {showCreateNew && (
                  <button
                    onClick={handleCreateNewPlayer}
                    disabled={invitePlayerMutation.isPending}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm border border-dashed border-primary/40 hover-elevate active-elevate-2 transition-colors mt-1"
                    data-testid="button-create-new-player"
                  >
                    <div className="w-7 h-7 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center">
                      <Plus className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span>Add <strong>"{playerSearchQuery.trim()}"</strong> as new player</span>
                  </button>
                )}
              </div>
              {playerSearchQuery.trim() !== "" && showCreateNew && (
                <p className="text-xs text-muted-foreground px-1">
                  After adding, use the Share Invite button to send the group invite code.
                </p>
              )}
            </div>
            {selectedPlayerIds.size > 0 && (
              <DialogFooter>
                <Button
                  onClick={handleAddSelectedPlayers}
                  disabled={addPlayerMutation.isPending}
                  data-testid="button-add-selected-players"
                >
                  {addPlayerMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  Add {selectedPlayerIds.size} Player{selectedPlayerIds.size === 1 ? '' : 's'}
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            My Groups
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your golf groups and invite friends
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setJoinDialogOpen(true)} variant="outline" data-testid="button-join-group">
            <UserPlus className="w-4 h-4 mr-2" />
            Join Group
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-group">
            <Plus className="w-4 h-4 mr-2" />
            Create Group
          </Button>
        </div>
      </div>

      {groupsLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : myGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Groups Yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create a group or join one with an invite code to get started.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setJoinDialogOpen(true)} data-testid="button-join-first-group">
                <UserPlus className="w-4 h-4 mr-2" />
                Join Group
              </Button>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-group">
                <Plus className="w-4 h-4 mr-2" />
                Create Group
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {myGroups.map((group) => (
            <Card
              key={group.id}
              className="hover-elevate cursor-pointer"
              onClick={() => setSelectedGroupId(group.id)}
              data-testid={`card-group-${group.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xl font-display">{group.name}</CardTitle>
                  <Badge variant={group.role === "admin" ? "default" : "outline"} data-testid={`badge-group-role-${group.id}`}>
                    {group.role === "admin" ? (
                      <><Shield className="w-3 h-3 mr-1" />Admin</>
                    ) : (
                      "Member"
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {group.description && (
                  <p className="text-sm text-muted-foreground mb-3">{group.description}</p>
                )}
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                  </div>
                  <div className="flex items-center gap-1">
                    <UserPlus className="w-4 h-4" />
                    {group.playerCount} {group.playerCount === 1 ? "player" : "players"}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="group-name">Name</label>
              <Input
                id="group-name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Enter group name"
                data-testid="input-group-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="group-description">Description (optional)</label>
              <Input
                id="group-description"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                placeholder="Enter group description"
                data-testid="input-group-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              data-testid="button-cancel-create-group"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate()}
              disabled={!newGroupName.trim() || createGroupMutation.isPending}
              data-testid="button-submit-create-group"
            >
              {createGroupMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guest player delete warning dialog (Groups tab) */}
      <Dialog
        open={guestDeleteConfirmId !== null && guestDeleteHasHistory}
        onOpenChange={(open) => { if (!open) { setGuestDeleteConfirmId(null); setGuestDeleteConfirmName(""); setGuestDeleteHasHistory(false); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Player Has Match History
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm">
              <strong>{guestDeleteConfirmName}</strong> has appeared in recorded matches.
              Deleting will remove their guest player record — past match records will keep
              the player's name but lose the link to this profile.
            </p>
            <p className="text-sm font-medium">Are you sure you want to delete anyway?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGuestDeleteConfirmId(null); setGuestDeleteConfirmName(""); setGuestDeleteHasHistory(false); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteGuestMutation.isPending}
              onClick={() => {
                if (guestDeleteConfirmId !== null) {
                  deleteGuestMutation.mutate({ id: guestDeleteConfirmId, force: true });
                }
              }}
              data-testid="button-confirm-force-delete-guest"
            >
              {deleteGuestMutation.isPending ? "Deleting…" : "Delete anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="invite-code">Invite Code</label>
              <Input
                id="invite-code"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder="Enter invite code"
                data-testid="input-invite-code"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setJoinDialogOpen(false)}
              data-testid="button-cancel-join-group"
            >
              Cancel
            </Button>
            <Button
              onClick={() => joinGroupMutation.mutate()}
              disabled={!inviteCodeInput.trim() || joinGroupMutation.isPending}
              data-testid="button-submit-join-group"
            >
              {joinGroupMutation.isPending ? "Joining..." : "Join"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
