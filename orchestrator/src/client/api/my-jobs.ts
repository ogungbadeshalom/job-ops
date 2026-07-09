import type { Job, JobsListResponse, StageEvent } from "@shared/types";
import { fetchApi, withQuery } from "./core";

export async function fetchMyJobs(
  clientId?: string,
): Promise<JobsListResponse<Job>> {
  const params: Record<string, string> = { view: "full" };
  if (clientId) params.clientId = clientId;
  return fetchApi<JobsListResponse<Job>>(withQuery("/jobs", params));
}

export async function fetchMyJob(id: string): Promise<Job> {
  return fetchApi<Job>(withQuery(`/jobs/${id}`, { t: Date.now() }));
}

export async function fetchMyJobStageEvents(id: string): Promise<StageEvent[]> {
  return fetchApi<StageEvent[]>(
    withQuery(`/jobs/${id}/events`, { t: Date.now() }),
  );
}

export async function fetchMyProgress(period: "day" | "week") {
  return fetchApi<{
    applied: number;
    dailyTarget: number | null;
    weeklyTarget: number | null;
  }>(`/my-jobs/progress?period=${period}`);
}
