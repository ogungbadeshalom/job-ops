import * as api from "@client/api";
import { createClientLogin } from "@client/api/agency";
import { PageHeader } from "@client/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Key, Save, UserCog, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { showErrorToast } from "@/client/lib/error-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const AdminClientEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [searchTermsInput, setSearchTermsInput] = useState("");
  const [enableTailoring, setEnableTailoring] = useState(true);
  const [dailyTarget, setDailyTarget] = useState("");
  const [weeklyTarget, setWeeklyTarget] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [currentAssignmentId, setCurrentAssignmentId] = useState<string | null>(
    null,
  );

  const [loginCredentials, setLoginCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);

  const {
    data: client,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["clients", id],
    queryFn: () => api.fetchClient(id!),
    enabled: Boolean(id),
  });

  const { data: users = [] } = useQuery({
    queryKey: ["workspaces", "users"],
    queryFn: api.fetchUsers,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", { clientId: id }],
    queryFn: () => api.fetchClientAssignments(id!),
    enabled: Boolean(id),
  });

  useQueryErrorToast(error, "Failed to load client");

  useEffect(() => {
    if (client) {
      setName(client.name ?? "");
      setEmail(client.email ?? "");
      setNotes(client.notes ?? "");
      setStatus(client.status ?? "active");
      setEnableTailoring(client.enableTailoring ?? true);
      setDailyTarget(client.dailyApplicationTarget?.toString() ?? "");
      setWeeklyTarget(client.weeklyApplicationTarget?.toString() ?? "");
      try {
        const terms = JSON.parse(client.searchTerms ?? "[]");
        setSearchTermsInput(Array.isArray(terms) ? terms.join(", ") : "");
      } catch {
        setSearchTermsInput(client.searchTerms ?? "");
      }
    }
  }, [client]);

  useEffect(() => {
    const activeAssignment = assignments.find((a) => a.status === "active");
    if (activeAssignment) {
      setSelectedWorkerId(activeAssignment.workerId);
      setCurrentAssignmentId(activeAssignment.id);
    } else {
      setSelectedWorkerId(null);
      setCurrentAssignmentId(null);
    }
  }, [assignments]);

  const updateMutation = useMutation({
    mutationFn: () => {
      const searchTerms = searchTermsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return api.updateClient(id!, {
        name,
        email,
        notes: notes || undefined,
        status: status as api.UpdateClientInput["status"],
        searchTerms,
        enableTailoring,
        dailyApplicationTarget: dailyTarget
          ? parseInt(dailyTarget, 10)
          : undefined,
        weeklyApplicationTarget: weeklyTarget
          ? parseInt(weeklyTarget, 10)
          : undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["clients", id] });
      toast.success("Client updated");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to update client");
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkerId) return;
      await api.assignWorker(selectedWorkerId, id!);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Worker assigned");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to assign worker");
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: () => {
      if (!currentAssignmentId) return Promise.resolve();
      return api.removeAssignment(currentAssignmentId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      setCurrentAssignmentId(null);
      setSelectedWorkerId(null);
      toast.success("Assignment removed");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to remove assignment");
    },
  });

  const createLoginMutation = useMutation({
    mutationFn: () => createClientLogin(id!),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["clients", id] });
      setLoginCredentials(data);
      toast.success("Client login created");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to create client login");
    },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const workerChanged =
        selectedWorkerId !== (client?.assignedWorkerId ?? null);
      await updateMutation.mutateAsync();

      if (workerChanged) {
        if (selectedWorkerId) {
          await assignMutation.mutateAsync();
        } else if (currentAssignmentId) {
          await removeAssignmentMutation.mutateAsync();
        }
      }

      navigate("/admin/clients");
    } catch {
      // Errors already handled in mutation callbacks
    }
  };

  const handleRemoveAssignment = () => {
    if (!window.confirm("Remove this worker assignment?")) return;
    removeAssignmentMutation.mutate();
  };

  const isSaving =
    updateMutation.isPending ||
    assignMutation.isPending ||
    removeAssignmentMutation.isPending;

  if (!id) {
    return (
      <div className="mx-auto max-w-xl px-4 py-6 text-center text-sm text-muted-foreground">
        Invalid client ID.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center text-sm text-muted-foreground">
        Loading client...
      </div>
    );
  }

  if (!client) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center text-sm text-muted-foreground">
        Client not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <PageHeader
        icon={UserCog}
        title={client.name}
        subtitle="Edit client details and assignment"
        badge={client.status}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/clients")}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        }
      />

      {client.stats && (
        <div className="mt-4 grid grid-cols-4 gap-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="text-center">
            <div className="text-lg font-bold">{client.stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Jobs</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{client.stats.applied}</div>
            <div className="text-xs text-muted-foreground">Applied</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{client.stats.interviewing}</div>
            <div className="text-xs text-muted-foreground">In Progress</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{client.stats.offer}</div>
            <div className="text-xs text-muted-foreground">Offers</div>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="mt-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={isSaving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSaving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={setStatus} disabled={isSaving}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this client..."
            rows={3}
            disabled={isSaving}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="searchTerms">Search Terms</Label>
          <Input
            id="searchTerms"
            value={searchTermsInput}
            onChange={(e) => setSearchTermsInput(e.target.value)}
            placeholder="e.g. frontend developer, react, typescript"
            disabled={isSaving}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated list of job search terms for this client.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <Label htmlFor="tailoring" className="text-sm font-medium">
              Enable Resume Tailoring
            </Label>
            <p className="text-xs text-muted-foreground">
              Automatically tailor resumes for this client&apos;s jobs.
            </p>
          </div>
          <Switch
            id="tailoring"
            checked={enableTailoring}
            onCheckedChange={setEnableTailoring}
            disabled={isSaving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dailyTarget">Daily Application Target</Label>
          <Input
            id="dailyTarget"
            type="number"
            min={0}
            value={dailyTarget}
            onChange={(e) => setDailyTarget(e.target.value)}
            placeholder="e.g. 50"
            disabled={isSaving}
          />
          <p className="text-xs text-muted-foreground">
            Optional daily application goal for this client.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="weeklyTarget">Weekly Application Target</Label>
          <Input
            id="weeklyTarget"
            type="number"
            min={0}
            value={weeklyTarget}
            onChange={(e) => setWeeklyTarget(e.target.value)}
            placeholder="e.g. 250"
            disabled={isSaving}
          />
          <p className="text-xs text-muted-foreground">
            Optional weekly application goal for this client.
          </p>
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-semibold">Assigned Worker</Label>
          {currentAssignmentId && client.assignedWorkerName ? (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <span className="text-sm font-medium">
                  {client.assignedWorkerName}
                </span>
                <p className="text-xs text-muted-foreground">
                  Currently assigned
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={handleRemoveAssignment}
                disabled={isSaving}
              >
                <X className="mr-1 h-3 w-3" />
                Remove
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Select
                value={selectedWorkerId ?? ""}
                onValueChange={(v) => setSelectedWorkerId(v || null)}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a worker..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.displayName || user.username}
                      {user.isSystemAdmin ? " (Admin)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {users.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No users available.
                </p>
              )}
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-semibold">Client Login</Label>
          {loginCredentials ? (
            <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-800 dark:text-green-200">
                  Login Credentials
                </CardTitle>
                <CardDescription className="text-xs text-green-700 dark:text-green-300">
                  Share these with the client. Password will not be shown again.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>
                  <span className="font-medium">Username:</span>{" "}
                  <code className="rounded bg-green-200 px-1 dark:bg-green-800">
                    {loginCredentials.username}
                  </code>
                </div>
                <div>
                  <span className="font-medium">Password:</span>{" "}
                  <code className="rounded bg-green-200 px-1 dark:bg-green-800">
                    {loginCredentials.password}
                  </code>
                </div>
              </CardContent>
            </Card>
          ) : client.hasLogin ? (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <span className="text-sm font-medium">Login exists</span>
                <p className="text-xs text-muted-foreground">
                  Client can sign in at /sign-in. Regenerate to reset
                  credentials.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Regenerate client credentials? The old credentials will be invalidated.",
                    )
                  )
                    return;
                  createLoginMutation.mutate();
                }}
                disabled={createLoginMutation.isPending}
              >
                <Key className="mr-1 h-4 w-4" />
                {createLoginMutation.isPending
                  ? "Regenerating..."
                  : "Regenerate"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <span className="text-sm font-medium">No login yet</span>
                <p className="text-xs text-muted-foreground">
                  Create a login so the client can view their jobs at /my-jobs.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => createLoginMutation.mutate()}
                disabled={createLoginMutation.isPending}
              >
                <Key className="mr-1 h-4 w-4" />
                {createLoginMutation.isPending ? "Creating..." : "Create Login"}
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/clients")}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !name.trim() || !email.trim()}
          >
            <Save className="mr-1 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
};
