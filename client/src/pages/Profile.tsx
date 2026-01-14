import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, Save, X, Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProfileData {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  presetPlayerName: string | null;
  aliases: string[];
  handicapIndex: number | null;
}

export default function Profile() {
  const { toast } = useToast();
  
  const { data: profile, isLoading } = useQuery<ProfileData>({
    queryKey: ['/api/profile'],
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [handicapIndex, setHandicapIndex] = useState("");
  const [newAlias, setNewAlias] = useState("");

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || "");
      setLastName(profile.lastName || "");
      setEmail(profile.email || "");
      setPhone(profile.phone || "");
      setAliases(profile.aliases || []);
      setHandicapIndex(profile.handicapIndex !== null ? (profile.handicapIndex / 10).toString() : "");
    }
  }, [profile]);

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
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter phone number"
                data-testid="input-phone"
              />
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
    </div>
  );
}
