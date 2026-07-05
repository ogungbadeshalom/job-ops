import { randomUUID } from "node:crypto";
import type {
  UpdateWatchlistSelectionsInput,
  WatchlistCheckInput,
  WatchlistCheckResponse,
  WatchlistJobState,
  WatchlistSelectedSource,
} from "@shared/types";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { db, schema } from "../db/index";
import {
  clientDataScopeFilter,
  getPrivateDataScope,
  privateDataScopeFilter,
} from "../tenancy/private-scope";

const {
  watchlistChecks,
  watchlistJobStates,
  watchlistSeenJobs,
  watchlistSelectedSources,
} = schema;

function userScopedFilter(table: {
  tenantId: AnySQLiteColumn;
  userId: AnySQLiteColumn;
}) {
  const scope = getPrivateDataScope();
  return and(
    eq(table.tenantId, scope.tenantId),
    eq(table.userId, scope.userId!),
  );
}

function mapRowToWatchlistJobState(
  row: typeof watchlistJobStates.$inferSelect,
): WatchlistJobState {
  return {
    source: row.source,
    sourceJobId: row.sourceJobId,
    state: row.state,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRowToWatchlistSelectedSource(
  row: typeof watchlistSelectedSources.$inferSelect,
): WatchlistSelectedSource {
  return {
    id: row.id,
    catalogSourceId: row.catalogSourceId,
    label: row.label,
    careersUrl: row.careersUrl,
    cxsJobsUrl: row.cxsJobsUrl,
    sourceType: row.sourceType,
    isCustom: row.isCustom,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listWatchlistSelectedSources(): Promise<
  WatchlistSelectedSource[]
> {
  const filters = [privateDataScopeFilter(watchlistSelectedSources)];
  const clientFilter = clientDataScopeFilter(watchlistSelectedSources);
  if (clientFilter) filters.push(clientFilter);
  const where = and(...filters);

  const rows = await db
    .select()
    .from(watchlistSelectedSources)
    .where(where)
    .orderBy(asc(watchlistSelectedSources.sortOrder));

  return rows.map(mapRowToWatchlistSelectedSource);
}

export async function replaceWatchlistSelectedSources(
  input: UpdateWatchlistSelectionsInput,
  clientId?: string | null,
): Promise<WatchlistSelectedSource[]> {
  const scope = getPrivateDataScope();
  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.delete(watchlistSelectedSources)
      .where(privateDataScopeFilter(watchlistSelectedSources))
      .run();

    if (input.selections.length === 0) {
      return;
    }

    tx.insert(watchlistSelectedSources)
      .values(
        input.selections.map((selection, index) => ({
          id: randomUUID(),
          tenantId: scope.tenantId,
          userId: scope.userId!,
          clientId: clientId ?? null,
          catalogSourceId: selection.catalogSourceId ?? null,
          label: selection.label?.trim() || selection.careersUrl,
          careersUrl: selection.careersUrl,
          cxsJobsUrl: null,
          sourceType: selection.sourceType,
          isCustom: !selection.catalogSourceId,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
  });

  return listWatchlistSelectedSources();
}

export async function listWatchlistJobStates(): Promise<WatchlistJobState[]> {
  const rows = await db
    .select()
    .from(watchlistJobStates)
    .where(userScopedFilter(watchlistJobStates));

  return rows.map(mapRowToWatchlistJobState);
}

export async function setWatchlistJobState(input: {
  source: string;
  sourceJobId: string;
  state: WatchlistJobState["state"];
}): Promise<WatchlistJobState> {
  const scope = getPrivateDataScope();
  const now = new Date().toISOString();

  const [existing] = await db
    .select({ id: watchlistJobStates.id })
    .from(watchlistJobStates)
    .where(
      and(
        userScopedFilter(watchlistJobStates),
        eq(watchlistJobStates.source, input.source),
        eq(watchlistJobStates.sourceJobId, input.sourceJobId),
      ),
    );

  if (existing) {
    await db
      .update(watchlistJobStates)
      .set({ state: input.state, updatedAt: now })
      .where(
        and(
          userScopedFilter(watchlistJobStates),
          eq(watchlistJobStates.id, existing.id),
        ),
      );
  } else {
    await db.insert(watchlistJobStates).values({
      id: randomUUID(),
      tenantId: scope.tenantId,
      userId: scope.userId!,
      source: input.source,
      sourceJobId: input.sourceJobId,
      state: input.state,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [row] = await db
    .select()
    .from(watchlistJobStates)
    .where(
      and(
        userScopedFilter(watchlistJobStates),
        eq(watchlistJobStates.source, input.source),
        eq(watchlistJobStates.sourceJobId, input.sourceJobId),
      ),
    );

  if (!row) {
    throw new Error("Failed to retrieve watchlist job state");
  }
  return mapRowToWatchlistJobState(row);
}

export async function clearWatchlistJobState(input: {
  source: string;
  sourceJobId: string;
}): Promise<number> {
  const result = await db
    .delete(watchlistJobStates)
    .where(
      and(
        userScopedFilter(watchlistJobStates),
        eq(watchlistJobStates.source, input.source),
        eq(watchlistJobStates.sourceJobId, input.sourceJobId),
      ),
    );

  return result.changes;
}

export async function recordWatchlistCheck(
  input: WatchlistCheckInput,
): Promise<WatchlistCheckResponse> {
  const scope = getPrivateDataScope();
  const now = new Date().toISOString();

  const normalizedChecks = input.checks
    .map((check) => ({
      source: String(check.source),
      sourceJobIds: Array.from(
        new Set(
          check.sourceJobIds
            .map((sourceJobId) => sourceJobId.trim())
            .filter(Boolean),
        ),
      ),
    }))
    .filter((check) => check.sourceJobIds.length > 0);

  return db.transaction((tx) => {
    const existingCheckpoint = tx
      .select()
      .from(watchlistChecks)
      .where(userScopedFilter(watchlistChecks))
      .get();

    const previousLastCheckedAt = existingCheckpoint?.lastCheckedAt ?? null;
    const existingSeenRows = normalizedChecks.map((check) =>
      tx
        .select()
        .from(watchlistSeenJobs)
        .where(
          and(
            userScopedFilter(watchlistSeenJobs),
            eq(watchlistSeenJobs.source, check.source),
            inArray(watchlistSeenJobs.sourceJobId, check.sourceJobIds),
          ),
        )
        .all(),
    );

    const existingSeenByKey = new Map<
      string,
      (typeof existingSeenRows)[number][number]
    >(
      existingSeenRows
        .flat()
        .map((row) => [`${row.source}:${row.sourceJobId}`, row] as const),
    );

    for (const check of normalizedChecks) {
      for (const sourceJobId of check.sourceJobIds) {
        const key = `${check.source}:${sourceJobId}`;
        const existing = existingSeenByKey.get(key);

        tx.insert(watchlistSeenJobs)
          .values({
            id: randomUUID(),
            tenantId: scope.tenantId,
            userId: scope.userId!,
            source: check.source,
            sourceJobId,
            firstSeenAt: existing?.firstSeenAt ?? now,
            lastSeenAt: now,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              watchlistSeenJobs.tenantId,
              watchlistSeenJobs.userId,
              watchlistSeenJobs.source,
              watchlistSeenJobs.sourceJobId,
            ],
            set: {
              lastSeenAt: now,
              updatedAt: now,
            },
          })
          .run();
      }
    }

    tx.insert(watchlistChecks)
      .values({
        id: existingCheckpoint?.id ?? randomUUID(),
        tenantId: scope.tenantId,
        userId: scope.userId!,
        lastCheckedAt: now,
        createdAt: existingCheckpoint?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [watchlistChecks.tenantId, watchlistChecks.userId],
        set: {
          lastCheckedAt: now,
          updatedAt: now,
        },
      })
      .run();

    const jobs = normalizedChecks.flatMap((check) =>
      check.sourceJobIds.map((sourceJobId) => {
        const existing = existingSeenByKey.get(
          `${check.source}:${sourceJobId}`,
        );
        const firstSeenAt = existing?.firstSeenAt ?? now;
        return {
          source: check.source,
          sourceJobId,
          isNewSinceLastCheck:
            previousLastCheckedAt !== null && existing === undefined,
          firstSeenAt,
          lastSeenAt: now,
        };
      }),
    );

    return {
      previousLastCheckedAt,
      checkedAt: now,
      jobs,
    };
  });
}
