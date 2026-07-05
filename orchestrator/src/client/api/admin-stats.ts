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
