import * as api from "@client/api";
import * as agencyApi from "@client/api/agency";
import { EmptyState, PageHeader, PageMain } from "@client/components/layout";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import { subscribeToEventSource } from "@client/lib/sse";
import type { JobListItem } from "@shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Loader2,
  Play,
  Send,
  Trophy,
  UserRoundCheck,
} from "lucide-react";
import type React from "react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PipelineProgressLike {
  step: string;
  message?: string;
  jobsDiscovered?: number;
  jobsProcessed?: number;
}

const statusTokens: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  discovered: {
    label: "Discovered",
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    dot: "bg-sky-400",
  },
  processing: {
    label: "Processing",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-400",
  },
  ready: {
    label: "Ready",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  applied: {
    label: "Applied",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  in_progress: {
    label: "In Progress",
    badge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    dot: "bg-cyan-400",
  },
  skipped: {
    label: "Skipped",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
  },
  expired: {
    label: "Expired",
    badge: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

function JobStatusBadge({ status }: { status: string }) {
  const token = statusTokens[status] ?? {
    label: status,
    badge: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
    dot: "bg-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${token.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${token.dot}`} />
      {token.label}
    </span>
  );
}

interface StatCardProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: number;
  className?: string;
}

function StatCard({ icon: Icon, label, value, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function canMarkApplied(status: string): boolean {
  return status !== "applied" && status !== "skipped" && status !== "expired";
}

function canSkip(status: string): boolean {
  return status === "ready" || status === "discovered";
}

export const WorkerClientDashboardPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: clientDetail,
    isLoading: clientLoading,
    isError: clientError,
    error: clientErrorObj,
  } = useQuery({
    queryKey: queryKeys.agency.client(id!),
    queryFn: () => agencyApi.fetchClient(id!),
    enabled: Boolean(id),
  });

  const { data: jobsResponse, isLoading: jobsLoading } = useQuery({
    queryKey: queryKeys.jobs.list({ view: "list", clientId: id }),
    queryFn: () => api.getJobs({ view: "list", clientId: id }),
  });

  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const {
    data: expandedJob,
    isLoading: expandedJobLoading,
    isError: expandedJobError,
  } = useQuery({
    queryKey: queryKeys.jobs.detail(expandedJobId ?? ""),
    queryFn: () => api.getJob(expandedJobId!),
    enabled: Boolean(expandedJobId),
  });

  const { data: dailyProgress } = useQuery({
    queryKey: ["agency", "client", id, "progress", "day"],
    queryFn: () => agencyApi.fetchClientProgress(id!, "day"),
    enabled: Boolean(id),
  });

  const { data: weeklyProgress } = useQuery({
    queryKey: ["agency", "client", id, "progress", "week"],
    queryFn: () => agencyApi.fetchClientProgress(id!, "week"),
    enabled: Boolean(id),
  });

  const applyMutation = useMutation({
    mutationFn: api.markAsApplied,
    onSuccess: () => {
      toast.success("Marked as applied");
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.agency.client(id!),
      });
    },
    onError: (err) => {
      showErrorToast(err, "Failed to mark as applied");
    },
  });

  const skipMutation = useMutation({
    mutationFn: (jobId: string) => api.skipJob(jobId),
    onSuccess: () => {
      toast.success("Job skipped");
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.agency.client(id!),
      });
    },
    onError: (err) => {
      showErrorToast(err, "Failed to skip job");
    },
  });

  const pdfMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const blob = await api.getJobPdfBlob(jobId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume-${jobId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success("PDF downloaded");
    },
    onError: (err) => {
      showErrorToast(err, "Failed to download PDF");
    },
  });

  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const pipelineJobsDiscoveredRef = useRef<number | null>(null);
  const pipelineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPipelineTimeout = useCallback(() => {
    if (pipelineTimeoutRef.current) {
      clearTimeout(pipelineTimeoutRef.current);
      pipelineTimeoutRef.current = null;
    }
  }, []);

  const startPipelineTimeout = () => {
    clearPipelineTimeout();
    pipelineTimeoutRef.current = setTimeout(() => {
      setIsPipelineRunning(false);
      toast.error(
        "Pipeline did not report a result within 2 minutes. It may still be running in the background. If no jobs appear, check the server logs or the LLM configuration.",
        { duration: 6000 },
      );
    }, 120_000);
  };

  const pipelineMutation = useMutation({
    mutationFn: () => agencyApi.runPipelineForClient(id!),
    onSuccess: () => {
      setIsPipelineRunning(true);
      startPipelineTimeout();
      toast.message("Pipeline started — searching for jobs...");
    },
    onError: (err) => {
      setIsPipelineRunning(false);
      clearPipelineTimeout();
      showErrorToast(err, "Failed to start pipeline");
    },
  });

  useEffect(() => {
    const unsubscribe = subscribeToEventSource<PipelineProgressLike>(
      "/api/pipeline/progress",
      {
        onMessage: (payload) => {
          if (!payload || typeof payload.step !== "string") return;

          if (payload.step === "completed") {
            setIsPipelineRunning(false);
            clearPipelineTimeout();
            const discovered =
              typeof payload.jobsDiscovered === "number"
                ? payload.jobsDiscovered
                : pipelineJobsDiscoveredRef.current;
            queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
            queryClient.invalidateQueries({
              queryKey: queryKeys.agency.client(id!),
            });
            toast.success(
              `Pipeline completed — ${discovered ?? "?"} jobs found`,
            );
          } else if (
            payload.step === "failed" ||
            payload.step === "cancelled"
          ) {
            setIsPipelineRunning(false);
            clearPipelineTimeout();
            if (payload.step === "failed") {
              toast.error(`Pipeline failed: ${payload.message ?? ""}`);
            }
          }

          if (
            typeof payload.jobsDiscovered === "number" &&
            payload.jobsDiscovered > 0
          ) {
            pipelineJobsDiscoveredRef.current = payload.jobsDiscovered;
          }
        },
      },
    );

    return () => {
      unsubscribe();
      clearPipelineTimeout();
    };
  }, [id, queryClient, clearPipelineTimeout]);

  if (!id) {
    return (
      <EmptyState
        icon={Building2}
        title="No client selected"
        description="Navigate to a client to view their dashboard."
      />
    );
  }

  if (clientError) {
    showErrorToast(clientErrorObj, "Failed to load client");
  }

  const client = clientDetail;
  const stats = clientDetail?.stats ?? {
    total: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
  };

  const jobs = jobsResponse?.jobs ?? [];

  const toggleExpand = (jobId: string) => {
    setExpandedJobId((prev) => (prev === jobId ? null : jobId));
  };

  return (
    <>
      <PageHeader
        icon={Building2}
        title={client?.name ?? "Client Dashboard"}
        subtitle={client ? `${client.email}` : "Loading..."}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/agency/clients")}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Clients
          </Button>
        }
      />

      <PageMain>
        {clientLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : clientError ? (
          <EmptyState
            icon={Building2}
            title="Could not load client"
            description="An error occurred while fetching client details."
            action={
              <Button
                variant="outline"
                onClick={() => navigate("/agency/clients")}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to Clients
              </Button>
            }
          />
        ) : !client ? (
          <EmptyState
            icon={Building2}
            title="Client not found"
            description="This client may have been removed or you may not have access."
            action={
              <Button
                variant="outline"
                onClick={() => navigate("/agency/clients")}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to Clients
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Briefcase}
                label="Total Jobs"
                value={stats.total}
              />
              <StatCard icon={Send} label="Applied" value={stats.applied} />
              <StatCard
                icon={UserRoundCheck}
                label="Interviewing"
                value={stats.interviewing}
              />
              <StatCard icon={Trophy} label="Offers" value={stats.offer} />
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Pipeline</CardTitle>
                <Button
                  variant="default"
                  size="sm"
                  disabled={isPipelineRunning || pipelineMutation.isPending}
                  onClick={() => pipelineMutation.mutate()}
                >
                  {isPipelineRunning || pipelineMutation.isPending ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="mr-1 h-4 w-4" />
                      Run Pipeline
                    </>
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Run a search pipeline for this client&apos;s jobs based on
                  their configured search terms and preferences.
                </p>
              </CardContent>
            </Card>

            {(dailyProgress?.dailyTarget || weeklyProgress?.weeklyTarget) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Application Quota</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dailyProgress?.dailyTarget && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Today</span>
                        <span className="font-medium">
                          {dailyProgress.applied}/{dailyProgress.dailyTarget}
                        </span>
                      </div>
                      <ProgressBar
                        value={dailyProgress.applied}
                        max={dailyProgress.dailyTarget}
                      />
                    </div>
                  )}
                  {weeklyProgress?.weeklyTarget && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">This Week</span>
                        <span className="font-medium">
                          {weeklyProgress.applied}/{weeklyProgress.weeklyTarget}
                        </span>
                      </div>
                      <ProgressBar
                        value={weeklyProgress.applied}
                        max={weeklyProgress.weeklyTarget}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Jobs</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {jobsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No jobs found. Run a pipeline to discover jobs for this
                    client.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10" />
                          <TableHead>Job</TableHead>
                          <TableHead>Employer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobs.map((job: JobListItem) => {
                          const isExpanded = expandedJobId === job.id;
                          return (
                            <Fragment key={job.id}>
                              <TableRow
                                className="cursor-pointer"
                                onClick={() => toggleExpand(job.id)}
                              >
                                <TableCell className="w-10">
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate font-medium">
                                  {job.title}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {job.employer}
                                </TableCell>
                                <TableCell>
                                  <JobStatusBadge status={job.status} />
                                </TableCell>
                                <TableCell>
                                  {job.suitabilityScore != null
                                    ? `${job.suitabilityScore}%`
                                    : "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {canMarkApplied(job.status) && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-emerald-400"
                                        disabled={applyMutation.isPending}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          applyMutation.mutate(job.id);
                                        }}
                                      >
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span className="sr-only">
                                          Mark Applied
                                        </span>
                                      </Button>
                                    )}
                                    {canSkip(job.status) && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-rose-400"
                                        disabled={skipMutation.isPending}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          skipMutation.mutate(job.id);
                                        }}
                                      >
                                        <Ban className="h-4 w-4" />
                                        <span className="sr-only">Skip</span>
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                              {isExpanded && (
                                <TableRow className="bg-muted/30">
                                  <TableCell colSpan={6} className="p-0">
                                    <div className="px-4 py-4">
                                      {expandedJobLoading && (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          Loading job details...
                                        </div>
                                      )}
                                      {expandedJobError && (
                                        <div className="text-sm text-destructive">
                                          Could not load job details. Try again
                                          or check the job in the main
                                          orchestrator.
                                        </div>
                                      )}
                                      {expandedJob && (
                                        <div className="space-y-4">
                                          <div className="space-y-1">
                                            <h4 className="text-sm font-semibold">
                                              Description
                                            </h4>
                                            <p className="text-sm text-muted-foreground">
                                              {expandedJob.jobDescription ||
                                                "No description available."}
                                            </p>
                                          </div>

                                          <div className="flex flex-wrap gap-2">
                                            {(expandedJob.jobUrl ||
                                              expandedJob.applicationLink) && (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                asChild
                                              >
                                                <a
                                                  href={
                                                    expandedJob.applicationLink ||
                                                    expandedJob.jobUrl
                                                  }
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                >
                                                  <ExternalLink className="mr-1 h-4 w-4" />
                                                  Open posting
                                                </a>
                                              </Button>
                                            )}
                                            {expandedJob.pdfPath && (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={pdfMutation.isPending}
                                                onClick={() =>
                                                  pdfMutation.mutate(
                                                    expandedJob.id,
                                                  )
                                                }
                                              >
                                                <Download className="mr-1 h-4 w-4" />
                                                Download resume PDF
                                              </Button>
                                            )}
                                            {canMarkApplied(
                                              expandedJob.status,
                                            ) && (
                                              <Button
                                                variant="default"
                                                size="sm"
                                                disabled={
                                                  applyMutation.isPending
                                                }
                                                onClick={() =>
                                                  applyMutation.mutate(
                                                    expandedJob.id,
                                                  )
                                                }
                                              >
                                                <CheckCircle2 className="mr-1 h-4 w-4" />
                                                Mark Applied
                                              </Button>
                                            )}
                                            {canSkip(expandedJob.status) && (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={
                                                  skipMutation.isPending
                                                }
                                                onClick={() =>
                                                  skipMutation.mutate(
                                                    expandedJob.id,
                                                  )
                                                }
                                              >
                                                <Ban className="mr-1 h-4 w-4" />
                                                Skip
                                              </Button>
                                            )}
                                          </div>

                                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                                            {expandedJob.location && (
                                              <span>
                                                Location: {expandedJob.location}
                                              </span>
                                            )}
                                            {expandedJob.salary && (
                                              <span>
                                                Salary: {expandedJob.salary}
                                              </span>
                                            )}
                                            {expandedJob.datePosted && (
                                              <span>
                                                Posted:{" "}
                                                {new Date(
                                                  expandedJob.datePosted,
                                                ).toLocaleDateString()}
                                              </span>
                                            )}
                                            {expandedJob.source && (
                                              <span>
                                                Source: {expandedJob.source}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageMain>
    </>
  );
};

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
