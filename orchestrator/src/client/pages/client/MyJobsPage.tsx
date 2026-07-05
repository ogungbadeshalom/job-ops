import { useClientJobs } from "@client/hooks/useClientJob";
import type { Job, JobStatus } from "@shared/types";
import {
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquareText,
  Send,
} from "lucide-react";
import type React from "react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "../orchestrator/JobStatusBadge";

const statusTokens: Record<string, { label: string; className: string }> = {
  applied: {
    label: "Applied",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  },
  in_progress: {
    label: "In Progress",
    className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  },
  ready: {
    label: "Ready",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  discovered: {
    label: "Discovered",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  processing: {
    label: "Processing",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  skipped: {
    label: "Skipped",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  },
  expired: {
    label: "Expired",
    className: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
  },
};

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-rose-400";
}

export const MyJobsPage: React.FC = () => {
  const navigate = useNavigate();

  const { data: jobsResponse, isLoading } = useClientJobs();

  const stats = useMemo(() => {
    const byStatus =
      jobsResponse?.byStatus ?? ({} as Record<JobStatus, number>);
    const total = jobsResponse?.total ?? 0;
    const applied = (byStatus.applied ?? 0) + (byStatus.in_progress ?? 0);

    return [
      {
        label: "Total Applications",
        value: total,
        icon: BriefcaseBusiness,
        color: "text-sky-400",
      },
      {
        label: "Applied",
        value: applied,
        icon: Send,
        color: "text-blue-400",
      },
      {
        label: "In Progress",
        value: byStatus.in_progress ?? 0,
        icon: MessageSquareText,
        color: "text-cyan-400",
      },
      {
        label: "Ready",
        value: byStatus.ready ?? 0,
        icon: CheckCircle2,
        color: "text-emerald-400",
      },
    ];
  }, [jobsResponse]);

  const jobs: Job[] = jobsResponse?.jobs ?? [];

  if (isLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading your applications...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto space-y-6 px-4 py-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track the status of your job applications
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="bg-muted/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background/40">
                  <stat.icon className={stat.color} />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-semibold tabular-nums leading-none">
                    {stat.value}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Applications</CardTitle>
          <span className="text-sm text-muted-foreground">
            {jobs.length} job{jobs.length !== 1 ? "s" : ""}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-base font-semibold">No applications yet</div>
              <p className="max-w-md text-sm text-muted-foreground">
                Your applications will appear here once submitted.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => navigate(`/my-jobs/${job.id}`)}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {job.title}
                      </span>
                      <JobStatusBadge status={job.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{job.employer}</span>
                      {job.location && (
                        <>
                          <span className="text-border/60">|</span>
                          <span>{job.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {job.suitabilityScore !== null && (
                      <span
                        className={`text-xs font-semibold tabular-nums ${getScoreColor(job.suitabilityScore)}`}
                      >
                        {job.suitabilityScore}%
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={
                        statusTokens[job.status]?.className ??
                        "border-muted-foreground/20"
                      }
                    >
                      {statusTokens[job.status]?.label ?? job.status}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
};
