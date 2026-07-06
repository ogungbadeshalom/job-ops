import * as api from "@client/api";
import { fetchAdminJobAudit, fetchAdminStats } from "@client/api/admin-stats";
import { PageHeader, PageMain } from "@client/components/layout";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Loader2,
  MessageSquareText,
} from "lucide-react";
import type React from "react";
import { Fragment, useMemo, useState } from "react";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "discovered", label: "Discovered" },
  { value: "processing", label: "Processing" },
  { value: "ready", label: "Ready" },
  { value: "applied", label: "Applied" },
  { value: "in_progress", label: "In Progress" },
  { value: "skipped", label: "Skipped" },
  { value: "expired", label: "Expired" },
];

const statusBadgeClass: Record<string, string> = {
  discovered: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  processing: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  applied: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  in_progress: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  skipped: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  expired: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const AdminWorkLogPage: React.FC = () => {
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Fetch admin stats to populate filter dropdowns (clients + workers)
  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: fetchAdminStats,
  });

  // Fetch users for the filter dropdown
  const { data: users = [] } = useQuery({
    queryKey: ["workspaces", "users"],
    queryFn: api.fetchUsers,
  });

  const auditParams = useMemo(
    () => ({
      clientId: clientFilter !== "all" ? clientFilter : undefined,
      workerId: workerFilter !== "all" ? workerFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [clientFilter, workerFilter, statusFilter, page],
  );

  const {
    data: auditData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "job-audit", auditParams],
    queryFn: () => fetchAdminJobAudit(auditParams),
  });

  useQueryErrorToast(error, "Failed to load work log");

  const jobs = auditData?.jobs ?? [];
  const total = auditData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Client-side search filter (title/employer)
  const filteredJobs = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(
      (j) =>
        j.title?.toLowerCase().includes(q) ||
        j.employer?.toLowerCase().includes(q) ||
        j.workerName?.toLowerCase().includes(q) ||
        j.clientName?.toLowerCase().includes(q),
    );
  }, [jobs, search]);

  const resetPage = () => setPage(0);

  return (
    <>
      <PageHeader
        icon={ClipboardList}
        title="Work Log"
        subtitle="Audit every job application by worker and client"
      />
      <PageMain>
        {/* Filters */}
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Client
              </span>
              <Select
                value={clientFilter}
                onValueChange={(v) => {
                  setClientFilter(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {stats?.clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Worker
              </span>
              <Select
                value={workerFilter}
                onValueChange={(v) => {
                  setWorkerFilter(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All workers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All workers</SelectItem>
                  {users.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.displayName || w.username || "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Status
              </span>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  resetPage();
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Search
              </span>
              <Input
                placeholder="Title, employer, worker, client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {isLoading
              ? "Loading…"
              : `${total} job${total === 1 ? "" : "s"} found`}
          </span>
          {totalPages > 1 && (
            <span>
              Page {page + 1} of {totalPages}
            </span>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Worker</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-center">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No jobs match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => {
                  const isExpanded = expandedJobId === job.id;
                  return (
                    <Fragment key={job.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() =>
                          setExpandedJobId(isExpanded ? null : job.id)
                        }
                      >
                        <TableCell className="w-10">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {job.workerName ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {job.clientName ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          <div className="truncate font-medium">
                            {job.title}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {job.employer}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {job.source ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              statusBadgeClass[job.status] ??
                              "border-muted-foreground/20 bg-muted/30 text-muted-foreground"
                            }
                          >
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(job.appliedAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(job.updatedAt)}
                        </TableCell>
                        <TableCell className="text-center">
                          {job.noteCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <MessageSquareText className="h-3.5 w-3.5" />
                              {job.noteCount}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <JobAuditDetailRow jobId={job.id} jobUrl={job.jobUrl} />
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </PageMain>
    </>
  );
};

function JobAuditDetailRow({
  jobId,
  jobUrl,
}: {
  jobId: string;
  jobUrl: string | null;
}) {
  const { data: notes, isLoading } = useQuery({
    queryKey: ["admin", "job-notes", jobId],
    queryFn: () => api.getJobNotes(jobId),
  });

  return (
    <TableRow className="bg-muted/20">
      <TableCell colSpan={9} className="p-0">
        <div className="space-y-3 px-4 py-4">
          {jobUrl && (
            <a
              href={jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-sky-400 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Open job posting
            </a>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </h4>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notes…
              </div>
            ) : !notes || notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No notes recorded for this job.
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-md border border-border bg-background/50 p-3"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold">
                        {note.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(note.updatedAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {note.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
