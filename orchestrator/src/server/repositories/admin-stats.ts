import { rawDb } from "../db";

type ClientStats = {
  id: string;
  name: string;
  email: string;
  status: string;
  totalJobs: number;
  appliedJobs: number;
  interviewingJobs: number;
  offerJobs: number;
};

type PipelineRunItem = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
};

export type AdminStats = {
  totalClients: number;
  totalWorkers: number;
  totalJobs: number;
  activeClients: number;
  jobsByStatus: Record<string, number>;
  clients: ClientStats[];
  recentPipelineRuns: PipelineRunItem[];
};

export async function getAdminStats(tenantId: string): Promise<AdminStats> {
  const { count: totalClients } = rawDb
    .prepare("SELECT count(*) as count FROM clients WHERE tenant_id = ?")
    .get(tenantId) as { count: number };

  const { count: totalWorkers } = rawDb
    .prepare(
      "SELECT count(*) as count FROM tenant_memberships WHERE tenant_id = ? AND role = 'worker'",
    )
    .get(tenantId) as { count: number };

  const { count: activeClients } = rawDb
    .prepare(
      "SELECT count(*) as count FROM clients WHERE tenant_id = ? AND status = 'active'",
    )
    .get(tenantId) as { count: number };

  const { count: totalJobs } = rawDb
    .prepare("SELECT count(*) as count FROM jobs WHERE tenant_id = ?")
    .get(tenantId) as { count: number };

  const statusRows = rawDb
    .prepare(
      "SELECT status, count(*) as count FROM jobs WHERE tenant_id = ? GROUP BY status",
    )
    .all(tenantId) as Array<{ status: string; count: number }>;

  const jobsByStatus: Record<string, number> = {};
  for (const row of statusRows) {
    jobsByStatus[row.status] = row.count;
  }

  const clients = rawDb
    .prepare(
      `SELECT c.id, c.name, c.email, c.status,
        COUNT(j.id) as totalJobs,
        SUM(CASE WHEN j.status = 'applied' THEN 1 ELSE 0 END) as appliedJobs,
        SUM(CASE WHEN j.status = 'in_progress' THEN 1 ELSE 0 END) as interviewingJobs,
        SUM(CASE WHEN j.status = 'offer' THEN 1 ELSE 0 END) as offerJobs
      FROM clients c
      LEFT JOIN jobs j ON j.client_id = c.id AND j.tenant_id = ?
      WHERE c.tenant_id = ?
      GROUP BY c.id`,
    )
    .all(tenantId, tenantId) as ClientStats[];

  const recentPipelineRuns = rawDb
    .prepare(
      `SELECT pr.id, pr.client_id as clientId, c.name AS clientName, pr.status, pr.started_at as startedAt, pr.completed_at as completedAt
      FROM pipeline_runs pr
      LEFT JOIN clients c ON c.id = pr.client_id
      WHERE pr.tenant_id = ?
      ORDER BY pr.started_at DESC
      LIMIT 20`,
    )
    .all(tenantId) as PipelineRunItem[];

  return {
    totalClients,
    totalWorkers,
    totalJobs,
    activeClients,
    jobsByStatus,
    clients,
    recentPipelineRuns,
  };
}

export type AuditJobRow = {
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
};

export type JobAuditResult = {
  jobs: AuditJobRow[];
  total: number;
};

export function getAdminJobAudit(args: {
  tenantId: string;
  clientId?: string;
  workerId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): JobAuditResult {
  const { tenantId, clientId, workerId, status, limit = 50, offset = 0 } = args;

  const conditions: string[] = ["j.tenant_id = ?"];
  const params: (string | number)[] = [tenantId];

  if (clientId) {
    conditions.push("j.client_id = ?");
    params.push(clientId);
  }
  if (workerId) {
    conditions.push("j.user_id = ?");
    params.push(workerId);
  }
  if (status) {
    conditions.push("j.status = ?");
    params.push(status);
  }

  const where = conditions.join(" AND ");

  const { count: total } = rawDb
    .prepare(`SELECT count(*) as count FROM jobs j WHERE ${where}`)
    .get(...params) as { count: number };

  const jobs = rawDb
    .prepare(
      `SELECT j.id, j.title, j.employer, j.source, j.job_url, j.status,
              j.applied_at as appliedAt, j.created_at as createdAt, j.updated_at as updatedAt,
              j.user_id as userId, u.display_name as workerName,
              j.client_id as clientId, c.name as clientName,
              (SELECT count(*) FROM job_notes n WHERE n.job_id = j.id) as noteCount
       FROM jobs j
       LEFT JOIN users u ON u.id = j.user_id
       LEFT JOIN clients c ON c.id = j.client_id
       WHERE ${where}
       ORDER BY j.updated_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as AuditJobRow[];

  return { jobs, total };
}
