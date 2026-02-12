import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, Save, X, Plus, Loader2, Phone, Check, Bell, Users, Shield, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ProfileData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  phoneVerified?: boolean;
  presetPlayerName: string | null;
  aliases: string[];
  handicapIndex: number | null;
}

interface NotificationPreferences {
  matchInvitations: boolean;
  scoreUpdates: boolean;
  betResults: boolean;
  matchReminders: boolean;
}

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

export default function Profile() {
  const { toast } = useToast();
  
  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ['/api/profile'],
  });

  const { data: notificationPrefs } = useQuery<NotificationPreferences>({
    queryKey: ['/api/notifications/preferences'],
  });

  const { data: myGroups = [] } = useQuery<GroupSummary[]>({
    queryKey: ["/api/groups/my"],
  });

  const [leaveConfirmGroupId, setLeaveConfirmGroupId] = useState<number | null>(null);

  const leaveGroupMutation = useMutation({
    mutationFn: async (groupId: number) => {
      if (!profile?.id) throw new Error("Profile not loaded");
      return apiRequest("DELETE", `/api/groups/${groupId}/members/${profile.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups/my"] });
      setLeaveConfirmGroupId(null);
      toast({ title: "Left group", description: "You have been removed from the group." });
    },
    onError: (error: Error) => {
      setLeaveConfirmGroupId(null);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [handicapIndex, setHandicapIndex] = useState("");
  const [newAlias, setNewAlias] = useState("");
  
  // Phone verification state
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [phoneToVerify, setPhoneToVerify] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [phoneEdited, setPhoneEdited] = useState(false);
  
  // Compute verification status: verified if phone matches profile and phoneVerified is true, and phone hasn't been edited
  const isPhoneVerified = !phoneEdited && profile?.phoneVerified === true && phone === profile?.phone;

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || "");
      setLastName(profile.lastName || "");
      setEmail(profile.email || "");
      setPhone(profile.phone || "");
      setAliases(profile.aliases || []);
      setHandicapIndex(profile.handicapIndex !== null ? (profile.handicapIndex / 10).toString() : "");
      setPhoneEdited(false);
    }
  }, [profile]);

  // Send verification code mutation
  const sendVerificationMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      return apiRequest('POST', '/api/sms/send-verification', { phone: phoneNumber });
    },
    onSuccess: () => {
      setVerificationSent(true);
      toast({
        title: "Code sent",
        description: "Check your phone for the verification code.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification code",
        variant: "destructive",
      });
    },
  });

  // Verify code mutation
  const verifyCodeMutation = useMutation({
    mutationFn: async (data: { phone: string; code: string }) => {
      return apiRequest('POST', '/api/sms/verify-code', data);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      if (result.verified) {
        // Server has updated phone and phoneVerified - just refetch profile
        queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
        setShowVerificationDialog(false);
        setVerificationCode("");
        setVerificationSent(false);
        setPhoneEdited(false);
        
        toast({
          title: "Phone verified",
          description: "Your phone number has been verified.",
        });
      } else {
        toast({
          title: "Invalid code",
          description: "The verification code is incorrect or expired.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to verify code",
        variant: "destructive",
      });
    },
  });

  // Update notification preferences mutation
  const updateNotificationsMutation = useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      return apiRequest('PUT', '/api/notifications/preferences', prefs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
      toast({
        title: "Preferences updated",
        description: "Your notification settings have been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  const handleVerifyPhone = () => {
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      toast({
        title: "Phone required",
        description: "Please enter a phone number first.",
        variant: "destructive",
      });
      return;
    }
    setPhoneToVerify(cleanPhone);
    setShowVerificationDialog(true);
    setVerificationSent(false);
    setVerificationCode("");
  };

  const handleSendCode = () => {
    sendVerificationMutation.mutate(phoneToVerify);
  };

  const handleSubmitCode = () => {
    if (verificationCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter a 6-digit code.",
        variant: "destructive",
      });
      return;
    }
    verifyCodeMutation.mutate({ phone: phoneToVerify, code: verificationCode });
  };

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<ProfileData> & { aliases?: string[]; handicapIndex?: number | null }) => {
      return apiRequest('PUT', '/api/profile', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      toast({
        title: "Profile updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const handicapValue = handicapIndex.trim() ? Math.round(parseFloat(handicapIndex) * 10) : null;
    
    updateMutation.mutate({
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      aliases,
      handicapIndex: handicapValue,
    });
  };

  const addAlias = () => {
    const trimmed = newAlias.trim();
    if (trimmed && !aliases.includes(trimmed) && aliases.length < 10) {
      setAliases([...aliases, trimmed]);
      setNewAlias("");
    }
  };

  const removeAlias = (alias: string) => {
    setAliases(aliases.filter(a => a !== alias));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Profile Settings</h1>
          <p className="text-muted-foreground text-sm">Manage your personal information and preferences</p>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter first name"
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter last name"
                  data-testid="input-last-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneEdited(true);
                  }}
                  placeholder="Enter phone number"
                  data-testid="input-phone"
                />
                {phone.trim() && (
                  isPhoneVerified ? (
                    <Badge className="bg-emerald-600 text-white flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Verified
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleVerifyPhone}
                      data-testid="button-verify-phone"
                    >
                      <Phone className="w-4 h-4 mr-1" />
                      Verify
                    </Button>
                  )
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Verify your phone to receive match notifications via SMS
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Player Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={profile?.presetPlayerName || ""}
                  disabled
                  className="bg-muted"
                  data-testid="input-display-name"
                />
                <Badge variant="secondary">Locked</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Your display name was set during onboarding and cannot be changed.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="handicapIndex">Handicap Index</Label>
              <Input
                id="handicapIndex"
                type="number"
                step="0.1"
                min="0"
                max="54"
                value={handicapIndex}
                onChange={(e) => setHandicapIndex(e.target.value)}
                placeholder="e.g. 12.5"
                data-testid="input-handicap"
              />
              <p className="text-xs text-muted-foreground">
                Your official USGA handicap index (0.0 to 54.0)
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nicknames / Aliases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add nicknames that others might use when adding you to matches. This helps automatically link your scores.
            </p>

            <div className="flex flex-wrap gap-2">
              {aliases.map((alias) => (
                <Badge key={alias} variant="outline" className="flex items-center gap-1">
                  {alias}
                  <button
                    onClick={() => removeAlias(alias)}
                    className="ml-1 hover:text-destructive"
                    data-testid={`button-remove-alias-${alias}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="Add a nickname"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAlias())}
                disabled={aliases.length >= 10}
                data-testid="input-new-alias"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addAlias}
                disabled={!newAlias.trim() || aliases.length >= 10}
                data-testid="button-add-alias"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {aliases.length >= 10 && (
              <p className="text-xs text-muted-foreground">Maximum 10 aliases allowed</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Notification Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isPhoneVerified && (
              <div className="bg-muted/50 border rounded-md p-3 mb-4">
                <p className="text-sm text-muted-foreground">
                  Verify your phone number above to receive SMS notifications.
                </p>
              </div>
            )}
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Match Invitations</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified when added to a match
                  </p>
                </div>
                <Switch
                  checked={notificationPrefs?.matchInvitations ?? true}
                  onCheckedChange={(checked) => 
                    updateNotificationsMutation.mutate({ matchInvitations: checked })
                  }
                  disabled={!isPhoneVerified}
                  data-testid="switch-match-invitations"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Score Updates</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified when scores are entered
                  </p>
                </div>
                <Switch
                  checked={notificationPrefs?.scoreUpdates ?? false}
                  onCheckedChange={(checked) => 
                    updateNotificationsMutation.mutate({ scoreUpdates: checked })
                  }
                  disabled={!isPhoneVerified}
                  data-testid="switch-score-updates"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Bet Results</Label>
                  <p className="text-xs text-muted-foreground">
                    Get notified when a bet is settled
                  </p>
                </div>
                <Switch
                  checked={notificationPrefs?.betResults ?? true}
                  onCheckedChange={(checked) => 
                    updateNotificationsMutation.mutate({ betResults: checked })
                  }
                  disabled={!isPhoneVerified}
                  data-testid="switch-bet-results"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Match Reminders</Label>
                  <p className="text-xs text-muted-foreground">
                    Get reminder notifications for upcoming matches
                  </p>
                </div>
                <Switch
                  checked={notificationPrefs?.matchReminders ?? true}
                  onCheckedChange={(checked) => 
                    updateNotificationsMutation.mutate({ matchReminders: checked })
                  }
                  disabled={!isPhoneVerified}
                  data-testid="switch-match-reminders"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">My Groups</CardTitle>
          </CardHeader>
          <CardContent>
            {myGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">You are not a member of any groups yet.</p>
            ) : (
              <div className="space-y-3">
                {myGroups.map((group) => {
                  const isCreator = group.createdBy === profile?.id;
                  return (
                    <div
                      key={group.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border"
                      data-testid={`card-profile-group-${group.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate" data-testid={`text-profile-group-name-${group.id}`}>{group.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        {group.role === "admin" && (
                          <Badge variant="default" className="text-xs">
                            <Shield className="w-3 h-3 mr-1" />Admin
                          </Badge>
                        )}
                        {isCreator && (
                          <Badge variant="outline" className="text-xs">Creator</Badge>
                        )}
                        {leaveConfirmGroupId === group.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => leaveGroupMutation.mutate(group.id)}
                              disabled={leaveGroupMutation.isPending}
                              data-testid={`button-confirm-leave-group-${group.id}`}
                            >
                              {leaveGroupMutation.isPending ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : null}
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLeaveConfirmGroupId(null)}
                              data-testid={`button-cancel-leave-group-${group.id}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLeaveConfirmGroupId(group.id)}
                            disabled={isCreator || !profile?.id}
                            data-testid={`button-leave-group-${group.id}`}
                          >
                            <LogOut className="w-3.5 h-3.5 mr-1" />
                            Leave
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="w-full sm:w-auto"
            data-testid="button-save-profile"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Phone Verification Dialog */}
      <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Phone Number</DialogTitle>
            <DialogDescription>
              {verificationSent
                ? "Enter the 6-digit code we sent to your phone."
                : `We'll send a verification code to ${phoneToVerify}`}
            </DialogDescription>
          </DialogHeader>

          {!verificationSent ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <Phone className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{phoneToVerify}</span>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowVerificationDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendCode}
                  disabled={sendVerificationMutation.isPending}
                  data-testid="button-send-code"
                >
                  {sendVerificationMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Send Code
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="verification-code">Verification Code</Label>
                <Input
                  id="verification-code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="text-center text-lg tracking-widest"
                  data-testid="input-verification-code"
                />
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSendCode}
                  disabled={sendVerificationMutation.isPending}
                  data-testid="button-resend-code"
                >
                  Resend Code
                </Button>
                <Button
                  onClick={handleSubmitCode}
                  disabled={verifyCodeMutation.isPending || verificationCode.length !== 6}
                  data-testid="button-verify-code"
                >
                  {verifyCodeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Verify
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
