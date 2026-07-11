import { EmptyState, PageHeader, PageMain } from "@client/components/layout";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, Loader2 } from "lucide-react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as agencyApi from "../../api/agency";

const statusTokens: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  active: { label: "Active", variant: "default" },
  inactive: { label: "Inactive", variant: "secondary" },
  archived: { label: "Archived", variant: "outline" },
};

function toStatusToken(status: string) {
  return (
    statusTokens[status] ?? {
      label: status,
      variant: "outline" as const,
    }
  );
}

export const WorkerClientsPage: React.FC = () => {
  const navigate = useNavigate();

  const {
    data: clients,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.agency.clients(),
    queryFn: agencyApi.fetchMyClients,
  });

  // Batched progress for every assigned client — two requests for the whole
  // page (one per period), not an N+1 call per client.
  const { data: dailyProgress } = useQuery({
    queryKey: queryKeys.agency.clientsProgress("day"),
    queryFn: () => agencyApi.fetchMyClientsProgress("day"),
    enabled: Boolean(clients && clients.length > 0),
    staleTime: 30_000,
  });

  const { data: weeklyProgress } = useQuery({
    queryKey: queryKeys.agency.clientsProgress("week"),
    queryFn: () => agencyApi.fetchMyClientsProgress("week"),
    enabled: Boolean(clients && clients.length > 0),
    staleTime: 30_000,
  });

  if (isError) {
    showErrorToast(error, "Failed to load clients");
  }

  return (
    <>
      <PageHeader
        icon={Building2}
        title="My Clients"
        subtitle="Clients you're assigned to help"
      />

      <PageMain>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={Building2}
            title="Could not load clients"
            description="An error occurred while fetching your assigned clients."
            action={
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            }
          />
        ) : !clients || clients.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No clients assigned"
            description="You don't have any clients assigned to you yet. Ask your admin to assign you to a client."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => {
              const statusToken = toStatusToken(client.status);
              const daily = dailyProgress?.[client.id];
              const weekly = weeklyProgress?.[client.id];
              const hasDailyTarget = Boolean(daily?.dailyTarget);
              const hasWeeklyTarget = Boolean(weekly?.weeklyTarget);
              const showQuota = hasDailyTarget || hasWeeklyTarget;
              return (
                <Card
                  key={client.id}
                  className="cursor-pointer transition-colors hover:bg-muted/30"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate text-base">
                          {client.name}
                        </CardTitle>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {client.email}
                        </p>
                      </div>
                      <Badge variant={statusToken.variant}>
                        {statusToken.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>
                        {client.searchTerms
                          ? `${JSON.parse(client.searchTerms).length} search terms`
                          : "No search terms"}
                      </span>
                    </div>

                    {showQuota && (
                      <div className="space-y-2 border-t border-border/60 pt-3">
                        {hasDailyTarget && daily && (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Today</span>
                              <span className="font-medium tabular-nums">
                                {daily.applied}/{daily.dailyTarget}
                              </span>
                            </div>
                            <ProgressBar
                              value={daily.applied}
                              max={daily.dailyTarget ?? 0}
                            />
                          </div>
                        )}
                        {hasWeeklyTarget && weekly && (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">
                                This Week
                              </span>
                              <span className="font-medium tabular-nums">
                                {weekly.applied}/{weekly.weeklyTarget}
                              </span>
                            </div>
                            <ProgressBar
                              value={weekly.applied}
                              max={weekly.weeklyTarget ?? 0}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/agency/clients/${client.id}`)}
                      >
                        View
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageMain>
    </>
  );
};

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
