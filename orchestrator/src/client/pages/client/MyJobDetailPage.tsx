import { getCachedAuthHeader } from "@client/api/auth-session";
import {
  useClientJob,
  useClientJobStageEvents,
} from "@client/hooks/useClientJob";
import type { StageEvent } from "@shared/types";
import { STAGE_LABELS } from "@shared/types";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Download,
  Loader2,
  MapPin,
} from "lucide-react";
import type React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "../orchestrator/JobStatusBadge";

function formatDate(ts: number | string | null): string {
  if (!ts) return "";
  const date = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStageEventLabel(event: StageEvent): string {
  if (event.fromStage === null) {
    return `Applied`;
  }
  return `${STAGE_LABELS[event.toStage]}`;
}

export const MyJobDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const { data: job, isLoading: jobLoading } = useClientJob(id);
  const { data: events, isLoading: eventsLoading } =
    useClientJobStageEvents(id);

  const handleDownloadCv = async () => {
    if (!id) return;
    const url = `/api/jobs/${encodeURIComponent(id)}/pdf`;
    const authHeader = getCachedAuthHeader();
    try {
      const response = await fetch(url, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      if (blob.size === 0) {
        throw new Error(
          "The file came back empty. It may still be generating — try again in a moment.",
        );
      }
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = "cv.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  if (jobLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading application details...</p>
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="container mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">Application not found.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate("/my-jobs")}
        >
          Back to My Applications
        </Button>
      </main>
    );
  }

  const sortedEvents = events
    ? [...events].sort((a, b) => b.occurredAt - a.occurredAt)
    : [];

  return (
    <main className="container mx-auto space-y-6 px-4 py-6 pb-12">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground mb-2"
        onClick={() => navigate("/my-jobs")}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Applications
      </Button>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight">
                  {job.title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" />
                    {job.employer}
                  </span>
                  {job.location && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {job.location}
                    </span>
                  )}
                  {job.discoveredAt && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      {formatDate(job.discoveredAt)}
                    </span>
                  )}
                </div>
              </div>
              <JobStatusBadge status={job.status} />
            </div>
          </div>

          {job.jobDescription && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-invert max-w-none text-sm leading-relaxed text-muted-foreground line-clamp-[12]">
                  {job.jobDescription}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : sortedEvents.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No stage events recorded yet.
                </p>
              ) : (
                <div className="relative space-y-0">
                  <div className="absolute left-[13px] top-1 bottom-1 w-px bg-border/60" />
                  {sortedEvents.map((event) => (
                    <div key={event.id} className="relative flex gap-4 pb-5">
                      <div className="relative z-10 mt-1 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border-2 border-emerald-500/30 bg-emerald-500/10">
                        <div className="h-2 w-2 rounded-full bg-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {getStageEventLabel(event)}
                          </span>
                          {event.outcome && (
                            <Badge variant="secondary" className="text-[10px]">
                              {event.outcome.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(event.occurredAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Employer</span>
                <p className="text-sm font-medium">{job.employer}</p>
              </div>
              {job.location && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Location
                  </span>
                  <p className="text-sm">{job.location}</p>
                </div>
              )}
              {job.salary && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Salary</span>
                  <p className="text-sm">{job.salary}</p>
                </div>
              )}
              {job.deadline && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">
                    Deadline
                  </span>
                  <p className="text-sm">{formatDate(job.deadline)}</p>
                </div>
              )}
              {job.suitabilityScore !== null && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Score</span>
                  <p className="text-sm font-semibold tabular-nums">
                    {job.suitabilityScore}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Button className="w-full gap-2" onClick={handleDownloadCv}>
            <Download className="h-4 w-4" />
            Download CV
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current</span>
                <JobStatusBadge status={job.status} />
              </div>
              {job.outcome && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Outcome</span>
                  <Badge variant="outline">
                    {job.outcome.replace(/_/g, " ")}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
};
