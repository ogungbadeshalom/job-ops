import { fetchAdminStats } from "@client/api/admin-stats";
import { PageHeader } from "@client/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Activity, Briefcase, Building2, Users } from "lucide-react";
import type React from "react";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StatCardProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: number;
}

function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <Card>
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

export const AdminOverviewPage: React.FC = () => {
  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: fetchAdminStats,
  });

  useQueryErrorToast(error, "Failed to load admin stats");

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="py-12 text-center text-sm text-muted-foreground">
          No data available.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <PageHeader icon={Activity} title="Overview" subtitle="Admin dashboard" />

      {/* Summary Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Total Clients"
          value={stats.totalClients}
        />
        <StatCard
          icon={Users}
          label="Total Workers"
          value={stats.totalWorkers}
        />
        <StatCard icon={Briefcase} label="Total Jobs" value={stats.totalJobs} />
        <StatCard
          icon={Activity}
          label="Active Clients"
          value={stats.activeClients}
        />
      </div>

      {/* Jobs by Status */}
      <div className="mt-8">
        <h3 className="mb-3 text-sm font-semibold">Jobs by Status</h3>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(stats.jobsByStatus).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={2}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No jobs found.
                  </TableCell>
                </TableRow>
              )}
              {Object.entries(stats.jobsByStatus).map(([status, count]) => (
                <TableRow key={status}>
                  <TableCell className="capitalize">{status}</TableCell>
                  <TableCell className="text-right">{count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Client Breakdown */}
      <div className="mt-8">
        <h3 className="mb-3 text-sm font-semibold">Client Breakdown</h3>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Total Jobs</TableHead>
                <TableHead className="text-right">Applied</TableHead>
                <TableHead className="text-right">Interviewing</TableHead>
                <TableHead className="text-right">Offer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.clients.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No clients yet.
                  </TableCell>
                </TableRow>
              )}
              {stats.clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {client.email}
                  </TableCell>
                  <TableCell className="text-right">
                    {client.totalJobs}
                  </TableCell>
                  <TableCell className="text-right">
                    {client.appliedJobs}
                  </TableCell>
                  <TableCell className="text-right">
                    {client.interviewingJobs}
                  </TableCell>
                  <TableCell className="text-right">
                    {client.offerJobs}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Recent Pipeline Runs */}
      <div className="mt-8">
        <h3 className="mb-3 text-sm font-semibold">Recent Pipeline Runs</h3>
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.recentPipelineRuns.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No pipeline runs yet.
                  </TableCell>
                </TableRow>
              )}
              {stats.recentPipelineRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-muted-foreground">
                    {run.clientName ?? "Unknown"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{run.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.startedAt
                      ? new Date(run.startedAt).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};
