import type { Job, JobsListResponse, StageEvent } from "@shared/types";
import { fetchApi, withQuery } from "./core";

export async function fetchMyJobs(
  clientId: string,
): Promise<JobsListResponse<Job>> {
  return fetchApi<JobsListResponse<Job>>(
    withQuery("/jobs", { clientId, view: "full" }),
  );
}

export async function fetchMyJob(id: string): Promise<Job> {
  return fetchApi<Job>(withQuery(`/jobs/${id}`, { t: Date.now() }));
}

export async function fetchMyJobStageEvents(
  id: string,
): Promise<StageEvent[]> {
  return fetchApi<StageEvent[]>(
    withQuery(`/jobs/${id}/events`, { t: Date.now() }),
  );
}
