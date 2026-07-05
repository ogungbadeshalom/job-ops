import * as api from "@client/api";
import type { Job, JobsListResponse, StageEvent } from "@shared/types";
import { useQuery } from "@tanstack/react-query";

export function useClientJobs(clientId?: string) {
  return useQuery<JobsListResponse<Job>>({
    queryKey: ["client", "jobs", clientId],
    queryFn: () => api.fetchMyJobs(clientId),
    staleTime: 30_000,
  });
}

export function useClientJob(jobId: string | undefined) {
  return useQuery<Job>({
    queryKey: ["client", "job", jobId],
    queryFn: () => api.fetchMyJob(jobId!),
    enabled: !!jobId,
    staleTime: 30_000,
  });
}

export function useClientJobStageEvents(jobId: string | undefined) {
  return useQuery<StageEvent[]>({
    queryKey: ["client", "job", jobId, "events"],
    queryFn: () => api.fetchMyJobStageEvents(jobId!),
    enabled: !!jobId,
    staleTime: 30_000,
  });
}
