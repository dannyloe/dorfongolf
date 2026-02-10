import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, UserPlus, Copy, Shield, RefreshCw, Check, X, ArrowLeft, Plus, Trash2, Share2 } from "lucide-react";
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
  createdById: string;
  memberCount: number;
  playerCount: number;
  myRole: string;
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
  } | null;
}

interface GroupDetail {
  id: number;
  name: string;
  description: string | null;
  inviteCode: string | null;
  createdById: string;
  members: GroupMember[];
  players: Array<{ id: number; presetPlayerId: number; presetPlayerName: string }>;
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
  myRole: string;
}

interface PresetPlayer {
  id: number;
  name: string;
  claimedByUserId: string | null;
  claimedByName: string | null;
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
  const [addMemberMode, setAddMemberMode] = useState<'existing' | 'new'>('existing');
  const [newPlayerName, setNewPlayerName] = useState("");
  const [selectedExistingPlayerId, setSelectedExistingPlayerId] = useState<string>("");

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

  const { data: allPresetPlayers = [] } = useQuery<PresetPlayer[]>({
    queryKey: ["/api/preset-players"],
    queryFn: async () => {
      const res = await fetch("/api/preset-players", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch preset players");
      return res.json();
    },
    enabled: !!selectedGroupId,
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
    mutationFn: async (presetPlayerId: number) => {
      return apiRequest("POST", `/api/groups/${selectedGroupId}/players`, { presetPlayerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", selectedGroupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      toast({ title: "Player added" });
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
    setAddMemberMode('existing');
    setNewPlayerName("");
    setSelectedExistingPlayerId("");
  };

  const handleAddMember = () => {
    if (addMemberMode === 'existing' && selectedExistingPlayerId) {
      addPlayerMutation.mutate(Number(selectedExistingPlayerId));
      setAddMemberDialogOpen(false);
      resetAddMemberForm();
    } else if (addMemberMode === 'new' && newPlayerName.trim()) {
      invitePlayerMutation.mutate({
        name: newPlayerName.trim(),
      });
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

  const getInitials = (firstName: string | null, lastName: string | null, email: string | null) => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (firstName) return firstName[0].toUpperCase();
    if (email) return email[0].toUpperCase();
    return "?";
  };

  const isAdmin = groupDetail?.myRole === "admin";

  const existingPlayerIds = new Set(groupDetail?.players.map(p => p.presetPlayerId) ?? []);
  const availablePlayers = allPresetPlayers.filter(p => !existingPlayerIds.has(p.id));

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
          <Tabs defaultValue="members">
            <TabsList>
              <TabsTrigger value="members" data-testid="tab-members">Members</TabsTrigger>
              <TabsTrigger value="players" data-testid="tab-players">Players</TabsTrigger>
              {isAdmin && <TabsTrigger value="requests" data-testid="tab-requests">Join Requests</TabsTrigger>}
            </TabsList>

            <TabsContent value="members" className="space-y-3 mt-4">
              {groupDetail?.members.map((member) => (
                <Card key={member.userId} data-testid={`card-member-${member.userId}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
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
                            <p className="text-sm text-muted-foreground">{member.user.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={member.role === "admin" ? "default" : "outline"} data-testid={`badge-role-${member.userId}`}>
                          {member.role === "admin" ? (
                            <><Shield className="w-3 h-3 mr-1" />Admin</>
                          ) : (
                            "Member"
                          )}
                        </Badge>
                        {isAdmin && member.userId !== user?.id && (
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
              {groupDetail?.members.length === 0 && (
                <p className="text-muted-foreground text-center py-8">No members yet.</p>
              )}
            </TabsContent>

            <TabsContent value="players" className="space-y-4 mt-4">
              {isAdmin && (
                <Button
                  onClick={() => setAddMemberDialogOpen(true)}
                  data-testid="button-add-member"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
              )}

              {groupDetail?.players.map((player) => (
                <Card key={player.presetPlayerId} data-testid={`card-player-${player.presetPlayerId}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>{player.presetPlayerName[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                        </Avatar>
                        <p className="font-medium" data-testid={`text-player-name-${player.presetPlayerId}`}>
                          {player.presetPlayerName}
                        </p>
                      </div>
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
                  </CardContent>
                </Card>
              ))}
              {groupDetail?.players.length === 0 && (
                <p className="text-muted-foreground text-center py-8">No players added yet.</p>
              )}
            </TabsContent>

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
              <DialogTitle>Add Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={addMemberMode === 'existing' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAddMemberMode('existing')}
                  data-testid="button-mode-existing"
                  className="flex-1"
                >
                  Existing Player
                </Button>
                <Button
                  variant={addMemberMode === 'new' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAddMemberMode('new')}
                  data-testid="button-mode-new"
                  className="flex-1"
                >
                  New Player
                </Button>
              </div>

              {addMemberMode === 'existing' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Select Player</label>
                  {availablePlayers.length > 0 ? (
                    <Select value={selectedExistingPlayerId} onValueChange={setSelectedExistingPlayerId}>
                      <SelectTrigger data-testid="select-existing-player">
                        <SelectValue placeholder="Choose a player..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePlayers.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">All players are already in this group.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Player Name</label>
                    <Input
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      placeholder="Enter player name..."
                      data-testid="input-new-player-name"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    After adding, use the Share Invite button to send the group invite code via text, email, or any app on your device.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { resetAddMemberForm(); setAddMemberDialogOpen(false); }} data-testid="button-cancel-add-member">
                Cancel
              </Button>
              <Button
                onClick={handleAddMember}
                disabled={
                  (addMemberMode === 'existing' && !selectedExistingPlayerId) ||
                  (addMemberMode === 'new' && !newPlayerName.trim()) ||
                  invitePlayerMutation.isPending || addPlayerMutation.isPending
                }
                data-testid="button-confirm-add-member"
              >
                {invitePlayerMutation.isPending ? "Adding..." : "Add Member"}
              </Button>
            </DialogFooter>
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
                  <Badge variant={group.myRole === "admin" ? "default" : "outline"} data-testid={`badge-group-role-${group.id}`}>
                    {group.myRole === "admin" ? (
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
