import * as api from "@client/api";
import { PageHeader } from "@client/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck, UserPlus, Users } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { showErrorToast } from "@/client/lib/error-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const AdminWorkersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["workspaces", "users"],
    queryFn: api.fetchUsers,
  });

  const createUserMutation = useMutation({
    mutationFn: (input: {
      username: string;
      password: string;
      displayName: string;
      isSystemAdmin: boolean;
    }) => api.createWorkspaceUser(input),
    onSuccess: async () => {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setIsSystemAdmin(false);
      await queryClient.invalidateQueries({
        queryKey: ["workspaces", "users"],
      });
      toast.success("User created");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to create user");
    },
  });

  const disableUserMutation = useMutation({
    mutationFn: (input: { userId: string; isDisabled: boolean }) =>
      api.setWorkspaceUserDisabled(input.userId, input.isDisabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspaces", "users"],
      });
      toast.success("User updated");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to update user");
    },
  });

  useQueryErrorToast(error, "Failed to load users");

  const handleCreateUser = () => {
    if (!username.trim() || password.length < 8) return;
    createUserMutation.mutate({
      username: username.trim(),
      displayName: displayName.trim() || username.trim(),
      password,
      isSystemAdmin,
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <PageHeader
        icon={Users}
        title="Workers"
        subtitle="Manage workers who are assigned to clients"
      />

      <div className="mt-6 rounded-md border border-border bg-muted/30 p-4">
        <div className="mb-3 text-sm font-semibold">
          <UserPlus className="mr-1 inline h-4 w-4" />
          Create New User
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="displayName" className="text-xs">
              Name
            </Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              disabled={createUserMutation.isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="username" className="text-xs">
              Username
            </Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="off"
              disabled={createUserMutation.isPending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password" className="text-xs">
              Password
            </Label>
            <Input
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              type="password"
              autoComplete="new-password"
              disabled={createUserMutation.isPending}
            />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={isSystemAdmin}
                onChange={(e) => setIsSystemAdmin(e.target.checked)}
                disabled={createUserMutation.isPending}
                className="h-4 w-4"
              />
              Admin
            </label>
            <Button
              type="button"
              size="sm"
              onClick={handleCreateUser}
              disabled={
                createUserMutation.isPending ||
                username.trim().length === 0 ||
                password.length < 8
              }
            >
              Create
            </Button>
          </div>
        </div>
      </div>

      <Separator className="my-6" />

      {isLoading && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading users...
        </div>
      )}

      {!isLoading && users.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No users found.
        </div>
      )}

      {!isLoading && users.length > 0 && (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.displayName || user.username}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.username}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {user.isSystemAdmin ? (
                        <Badge variant="secondary">Admin</Badge>
                      ) : (
                        <Badge variant="outline">Worker</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.isDisabled ? (
                      <Badge variant="destructive">Disabled</Badge>
                    ) : (
                      <Badge
                        variant="default"
                        className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      >
                        <UserCheck className="mr-1 h-3 w-3" />
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disableUserMutation.isPending}
                      onClick={() =>
                        disableUserMutation.mutate({
                          userId: user.id,
                          isDisabled: !user.isDisabled,
                        })
                      }
                    >
                      {user.isDisabled ? "Enable" : "Disable"}
                    </Button>
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
