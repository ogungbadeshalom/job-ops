import { fetchAdminStats } from "@client/api/admin-stats";
import { ManualImportSheet } from "@client/components/ManualImportSheet";
import { useSettings } from "@client/hooks/useSettings";
import { isAdminFromToken } from "@client/lib/jwt";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import {
  ClientNameContext,
  type ClientNameMap,
} from "./orchestrator/ClientNameContext";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorJobWorkspaceContainer } from "./orchestrator/OrchestratorJobWorkspaceContainer";
import { OrchestratorSearchComposer } from "./orchestrator/OrchestratorSearchComposer";
import { useOrchestratorData } from "./orchestrator/useOrchestratorData";
import { useOrchestratorFilters } from "./orchestrator/useOrchestratorFilters";
import {
  useNavigationRefresh,
  useOrchestratorNavigation,
} from "./orchestrator/useOrchestratorNavigation";
import { useOrchestratorUiState } from "./orchestrator/useOrchestratorUiState";
import { usePipelineControls } from "./orchestrator/usePipelineControls";
import { usePipelineSearchPresets } from "./orchestrator/usePipelineSearchPresets";
import { usePipelineSources } from "./orchestrator/usePipelineSources";
import { useWatchlistPipelineSources } from "./orchestrator/useWatchlistPipelineSources";
import { getEnabledSources } from "./orchestrator/utils";

export const OrchestratorPage: React.FC = () => {
  const isAdmin = isAdminFromToken();
  const [isManualImportOpen, setIsManualImportOpen] = useState(false);
  const filters = useOrchestratorFilters();
  const navigation = useOrchestratorNavigation({
    searchParams: filters.searchParams,
  });
  const { settings } = useSettings();

  // Fetch client list once for admin so job rows can show client name badges.
  const { data: adminStats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: fetchAdminStats,
    enabled: isAdmin,
  });
  const clientNameMap = useMemo<ClientNameMap | null>(() => {
    if (!isAdmin || !adminStats?.clients) return null;
    const map = new Map<string, string>();
    for (const c of adminStats.clients) {
      map.set(c.id, c.name);
    }
    return map;
  }, [isAdmin, adminStats]);
  const {
    jobs,
    selectedJob,
    stats,
    isLoading,
    isPipelineRunning,
    setIsPipelineRunning,
    pipelineTerminalEvent,
    setIsRefreshPaused,
    loadJobs,
  } = useOrchestratorData(navigation.selectedJobId);

  useNavigationRefresh(loadJobs);

  const enabledSources = useMemo(
    () => getEnabledSources(settings ?? null),
    [settings],
  );
  const { pipelineSources, setPipelineSources, toggleSource } =
    usePipelineSources(enabledSources);
  const {
    watchlistSources,
    selectedWatchlistSourceIds,
    setSelectedWatchlistSourceIds,
    toggleWatchlistSource,
    isLoading: isWatchlistSourcesLoading,
  } = useWatchlistPipelineSources();

  const {
    isRunModeModalOpen,
    setIsRunModeModalOpen,
    runMode,
    setRunMode,
    isCancelling,
    openRunMode,
    handleCancelPipeline,
    handleSaveAndRunAutomatic,
    handleManualImported,
  } = usePipelineControls({
    isPipelineRunning,
    setIsPipelineRunning,
    pipelineTerminalEvent,
    pipelineSources,
    watchlistSelectedSourceIds: selectedWatchlistSourceIds,
    loadJobs,
    navigateWithContext: navigation.navigateWithContext,
  });

  const isFirstRunWorkspace = !isLoading && jobs.length === 0;
  const isSearchComposerVisible = isRunModeModalOpen || isFirstRunWorkspace;
  const canToggleSearchComposer = !isFirstRunWorkspace;
  const searchPresetProps = usePipelineSearchPresets({
    enabled: isSearchComposerVisible && runMode === "automatic",
  });
  const ui = useOrchestratorUiState({
    isSearchComposerVisible,
    selectedJobId: navigation.selectedJobId,
    onClearSelectedJob: () => navigation.handleSelectJobId(null),
  });
  const handleToggleAutomaticRun = useCallback(() => {
    if (isSearchComposerVisible && canToggleSearchComposer) {
      setIsRunModeModalOpen(false);
      return;
    }

    openRunMode("automatic");
  }, [
    canToggleSearchComposer,
    isSearchComposerVisible,
    openRunMode,
    setIsRunModeModalOpen,
  ]);

  return (
    <ClientNameContext.Provider value={clientNameMap}>
      <OrchestratorHeader
        isPipelineRunning={isPipelineRunning}
        isCancelling={isCancelling}
        pipelineSources={pipelineSources}
        hideRunAction={
          isAdminFromToken() ||
          (isSearchComposerVisible && !canToggleSearchComposer)
        }
        isSearchComposerOpen={
          !isAdminFromToken() &&
          isSearchComposerVisible &&
          canToggleSearchComposer
        }
        onOpenAutomaticRun={handleToggleAutomaticRun}
        onCancelPipeline={handleCancelPipeline}
        onOpenManualImport={() => setIsManualImportOpen(true)}
      />

      <main
        className={
          isSearchComposerVisible
            ? "min-h-[calc(100dvh-6rem)]"
            : "container mx-auto space-y-6 px-4 py-6 pb-12"
        }
      >
        {isSearchComposerVisible ? (
          <OrchestratorSearchComposer
            mode={runMode}
            settings={settings ?? null}
            enabledSources={enabledSources}
            pipelineSources={pipelineSources}
            onToggleSource={toggleSource}
            onSetPipelineSources={setPipelineSources}
            watchlistSources={watchlistSources}
            selectedWatchlistSourceIds={selectedWatchlistSourceIds}
            onToggleWatchlistSource={toggleWatchlistSource}
            onSetSelectedWatchlistSourceIds={setSelectedWatchlistSourceIds}
            isWatchlistSourcesLoading={isWatchlistSourcesLoading}
            isPipelineRunning={isPipelineRunning}
            onOpenChange={setIsRunModeModalOpen}
            onModeChange={setRunMode}
            onSaveAndRunAutomatic={handleSaveAndRunAutomatic}
            onManualImported={handleManualImported}
            {...searchPresetProps}
          />
        ) : (
          <OrchestratorJobWorkspaceContainer
            jobs={jobs}
            selectedJob={selectedJob}
            stats={stats}
            isLoading={isLoading}
            isPipelineRunning={isPipelineRunning}
            loadJobs={loadJobs}
            setIsRefreshPaused={setIsRefreshPaused}
            filters={filters}
            navigation={navigation}
            ui={ui}
            openRunMode={openRunMode}
          />
        )}
      </main>

      <ManualImportSheet
        open={isManualImportOpen}
        onOpenChange={setIsManualImportOpen}
        onImported={async (result) => {
          await handleManualImported(result);
        }}
      />
    </ClientNameContext.Provider>
  );
};
