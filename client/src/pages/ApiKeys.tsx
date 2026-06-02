import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Key, Trash2, Plus, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ApiKeyRow = { id: number; name: string; createdAt: string | null; lastUsedAt: string | null };

export default function ApiKeys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<{ name: string; rawKey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys = [], isLoading } = useQuery<ApiKeyRow[]>({ queryKey: ["/api/api-keys"] });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/api-keys", { name });
      return res.json();
    },
    onSuccess: (data: { id: number; name: string; rawKey: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setCreatedKey({ name: data.name, rawKey: data.rawKey });
      setNewKeyName("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({ title: "Key revoked" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) {
      toast({ title: "Enter a name for the key", variant: "destructive" });
      return;
    }
    createMutation.mutate(newKeyName.trim());
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API Keys</h1>
        <p className="text-muted-foreground mt-1">
          Generate keys to access your scorecard data from scripts or tools like Excel Power Query.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate new key</CardTitle>
          <CardDescription>Give your key a descriptive name so you remember what it's for.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="key-name" className="sr-only">Key name</Label>
              <Input
                id="key-name"
                data-testid="input-key-name"
                placeholder="e.g. Excel Power Query"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
            </div>
            <Button
              data-testid="button-generate-key"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              <Plus className="w-4 h-4 mr-2" />
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export endpoints</CardTitle>
          <CardDescription>Use these URLs with your API key as a Bearer token.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2 font-mono bg-muted px-3 py-2 rounded-md text-xs overflow-x-auto">
            <span className="text-muted-foreground shrink-0">GET</span>
            <span>/api/export/scores.xlsx</span>
            <span className="text-muted-foreground ml-auto shrink-0">Excel file</span>
          </div>
          <div className="flex items-center gap-2 font-mono bg-muted px-3 py-2 rounded-md text-xs overflow-x-auto">
            <span className="text-muted-foreground shrink-0">GET</span>
            <span>/api/export/scores.csv</span>
            <span className="text-muted-foreground ml-auto shrink-0">CSV file</span>
          </div>
          <p className="text-muted-foreground text-xs pt-1">
            Add header: <code className="bg-muted px-1 rounded">Authorization: Bearer YOUR_KEY</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">No keys yet. Generate one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map(key => (
                  <TableRow key={key.id} data-testid={`row-api-key-${key.id}`}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {key.createdAt ? format(new Date(key.createdAt), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {key.lastUsedAt ? format(new Date(key.lastUsedAt), "MMM d, yyyy") : "Never"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-revoke-key-${key.id}`}
                        onClick={() => deleteMutation.mutate(key.id)}
                        disabled={deleteMutation.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!createdKey} onOpenChange={open => { if (!open) { setCreatedKey(null); setCopied(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy this key now — it won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
              <code className="flex-1 text-xs break-all font-mono">{createdKey?.rawKey}</code>
              <Button variant="ghost" size="icon" onClick={handleCopy} data-testid="button-copy-key">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <Button className="w-full" onClick={() => { setCreatedKey(null); setCopied(false); }} data-testid="button-close-key-dialog">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
