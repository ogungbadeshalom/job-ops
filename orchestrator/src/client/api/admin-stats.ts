import { fetchApi } from "./core";

export interface PipelineRunSummary {
  id: string;
  clientId: string | null;
  clientName: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

export interface ClientStatsRow {
  id: string;
  name: string;
  email: string;
  status: string;
  totalJobs: number;
  appliedJobs: number;
  interviewingJobs: number;
  offerJobs: number;
}

export interface AdminStats {
  totalClients: number;
  totalWorkers: number;
  totalJobs: number;
  activeClients: number;
  jobsByStatus: Record<string, number>;
  clients: ClientStatsRow[];
  recentPipelineRuns: PipelineRunSummary[];
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return fetchApi<AdminStats>("/admin/stats");
}

export interface AuditJobRow {
  id: string;
  title: string;
  employer: string;
  source: string | null;
  jobUrl: string | null;
  status: string;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  workerName: string | null;
  clientId: string | null;
  clientName: string | null;
  noteCount: number;
}

export interface JobAuditResult {
  jobs: AuditJobRow[];
  total: number;
}

export interface JobAuditParams {
  clientId?: string;
  workerId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function fetchAdminJobAudit(
  params: JobAuditParams = {},
): Promise<JobAuditResult> {
  const query = new URLSearchParams();
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.workerId) query.set("workerId", params.workerId);
  if (params.status) query.set("status", params.status);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  const qs = query.toString();
  return fetchApi<JobAuditResult>(
    `/admin/stats/job-audit${qs ? `?${qs}` : ""}`,
  );
}
