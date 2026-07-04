import * as api from "@client/api";
import { PageHeader, PageMain, EmptyState } from "@client/components/layout";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import { subscribeToEventSource } from "@client/lib/sse";
import type { JobListItem } from "@shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Send,
  Trophy,
  UserRoundCheck,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import * as agencyApi from "../../api/agency";

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

  const {
    data: jobsResponse,
    isLoading: jobsLoading,
  } = useQuery({
    queryKey: queryKeys.jobs.list({ view: "list" }),
    queryFn: () => api.getJobs({ view: "list" }),
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

  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const pipelineJobsDiscoveredRef = useRef<number | null>(null);

  const pipelineMutation = useMutation({
    mutationFn: () => agencyApi.runPipelineForClient(id!),
    onSuccess: () => {
      setIsPipelineRunning(true);
      toast.message("Pipeline started — searching for jobs...");
    },
    onError: (err) => {
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

    return unsubscribe;
  }, [id, queryClient]);

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

  const client = clientDetail?.client;
  const stats = clientDetail?.stats ?? {
    total: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
  };

  const jobs = jobsResponse?.jobs ?? [];

  return (
    <>
      <PageHeader
        icon={Building2}
        title={client?.name ?? "Client Dashboard"}
        subtitle={
          client
            ? `${client.email}`
            : "Loading..."
        }
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
              <StatCard
                icon={Send}
                label="Applied"
                value={stats.applied}
              />
              <StatCard
                icon={UserRoundCheck}
                label="Interviewing"
                value={stats.interviewing}
              />
              <StatCard
                icon={Trophy}
                label="Offers"
                value={stats.offer}
              />
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
                  Run a search pipeline for this client's jobs based on their
                  configured search terms and preferences.
                </p>
              </CardContent>
            </Card>

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
                          <TableHead>Job</TableHead>
                          <TableHead>Employer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead className="text-right">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobs.map((job: JobListItem) => (
                          <TableRow key={job.id}>
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    navigate(`/jobs/ready/${job.id}`)
                                  }
                                >
                                  <Clock className="h-4 w-4" />
                                  <span className="sr-only">View</span>
                                </Button>
                                {job.status === "ready" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-emerald-400"
                                    disabled={applyMutation.isPending}
                                    onClick={() =>
                                      applyMutation.mutate(job.id)
                                    }
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span className="sr-only">
                                      Mark Applied
                                    </span>
                                  </Button>
                                )}
                                {(job.status === "ready" ||
                                  job.status === "discovered") && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-rose-400"
                                    disabled={skipMutation.isPending}
                                    onClick={() =>
                                      skipMutation.mutate(job.id)
                                    }
                                  >
                                    <CheckCircle2 className="h-4 w-4 rotate-45" />
                                    <span className="sr-only">Skip</span>
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
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
