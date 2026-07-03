import * as api from "@client/api";
import { PageHeader } from "@client/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, UserCog, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { showErrorToast } from "@/client/lib/error-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const CLIENT_STATUS_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  inactive: "secondary",
  archived: "destructive",
};

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
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [currentAssignmentId, setCurrentAssignmentId] = useState<string | null>(null);

  const { data: client, isLoading, error } = useQuery({
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
    mutationFn: () => {
      if (!selectedWorkerId) {
        return Promise.resolve();
      }
      return api.assignWorker(selectedWorkerId, id!);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const workerChanged = selectedWorkerId !== (client?.assignedWorkerId ?? null);
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

  const isSaving = updateMutation.isPending || assignMutation.isPending || removeAssignmentMutation.isPending;

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
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/clients")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Clients
        </Button>
      </div>

      <PageHeader
        icon={UserCog}
        title={client.name}
        subtitle="Edit client details and assignment"
        badge={
          <Badge
            variant={
              CLIENT_STATUS_BADGE[client.status] ?? "default"
            }
          >
            {client.status}
          </Badge>
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
              Automatically tailor resumes for this client's jobs.
            </p>
          </div>
          <Switch
            id="tailoring"
            checked={enableTailoring}
            onCheckedChange={setEnableTailoring}
            disabled={isSaving}
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-semibold">Assigned Worker</Label>
          {currentAssignmentId && client.assignedWorkerName ? (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <span className="text-sm font-medium">{client.assignedWorkerName}</span>
                <p className="text-xs text-muted-foreground">Currently assigned</p>
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

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/clients")}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving || !name.trim() || !email.trim()}>
            <Save className="mr-1 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
};
