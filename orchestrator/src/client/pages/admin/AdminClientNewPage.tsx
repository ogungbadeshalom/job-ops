import * as api from "@client/api";
import { PageHeader } from "@client/components/layout";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, UserPlus } from "lucide-react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export const AdminClientNewPage: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [searchTermsInput, setSearchTermsInput] = React.useState("");
  const [enableTailoring, setEnableTailoring] = React.useState(true);

  const createMutation = useMutation({
    mutationFn: (data: api.CreateClientInput) => api.createClient(data),
    onSuccess: (client) => {
      toast.success("Client created");
      navigate(`/admin/clients/${client.id}`);
    },
    onError: (error) => {
      showErrorToast(error, "Failed to create client");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    const searchTerms = searchTermsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    createMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      notes: notes.trim() || undefined,
      searchTerms: searchTerms.length > 0 ? searchTerms : undefined,
      enableTailoring,
    });
  };

  const isPending = createMutation.isPending;

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/clients")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Clients
        </Button>
      </div>

      <PageHeader
        icon={UserPlus}
        title="New Client"
        subtitle="Add a client to the agency platform"
      />

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client name"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this client..."
            rows={3}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="searchTerms">Search Terms</Label>
          <Input
            id="searchTerms"
            value={searchTermsInput}
            onChange={(e) => setSearchTermsInput(e.target.value)}
            placeholder="e.g. frontend developer, react, typescript"
            disabled={isPending}
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
            disabled={isPending}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/clients")}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || !name.trim() || !email.trim()}>
            {isPending ? "Creating..." : "Create Client"}
          </Button>
        </div>
      </form>
    </div>
  );
};
