import * as api from "@client/api";
import { PageHeader } from "@client/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ExternalLink, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { showErrorToast } from "@/client/lib/error-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_BADGE_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  inactive: "secondary",
  archived: "destructive",
};

export const AdminClientsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: clients = [], isLoading, error } = useQuery({
    queryKey: ["clients"],
    queryFn: api.fetchClients,
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      api.updateClient(id, { status: "archived" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client archived");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to archive client");
    },
  });

  useQueryErrorToast(error, "Failed to load clients");

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Archive client "${name}"?`)) return;
    setDeletingId(id);
    try {
      await archiveMutation.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <PageHeader
        icon={Building2}
        title="Clients"
        subtitle="Manage agency clients"
        actions={
          <Button asChild size="sm">
            <Link to="/admin/clients/new">
              <Plus className="mr-1 h-4 w-4" />
              New Client
            </Link>
          </Button>
        }
      />

      {isLoading && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading clients...
        </div>
      )}

      {!isLoading && clients.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No clients yet. Create your first client to get started.
        </div>
      )}

      {!isLoading && clients.length > 0 && (
        <div className="mt-4 rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned Worker</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium text-primary hover:underline"
                      onClick={() => navigate(`/admin/clients/${client.id}`)}
                    >
                      {client.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        (STATUS_BADGE_VARIANTS[client.status] as "default") ??
                        "default"
                      }
                    >
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.assignedWorkerName ?? (
                      <span className="italic">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Edit client"
                        onClick={() => navigate(`/admin/clients/${client.id}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        title="Archive client"
                        disabled={deletingId === client.id || client.status === "archived"}
                        onClick={() => handleDelete(client.id, client.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
