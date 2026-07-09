import { TokenizedInput } from "@client/pages/orchestrator/TokenizedInput";
import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type { ScoringValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

type ScoringSettingsSectionProps = {
  values: ScoringValues;
  isLoading: boolean;
  isSaving: boolean;
  layoutMode?: "accordion" | "panel";
};

function parseTokenizedKeywordInput(input: string): string[] {
  return input
    .split(/[\n,]/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

export const ScoringSettingsSection: React.FC<ScoringSettingsSectionProps> = ({
  values,
  isLoading,
  isSaving,
  layoutMode,
}) => {
  const {
    penalizeMissingSalary,
    missingSalaryPenalty,
    autoSkipScoreThreshold,
    blockedCompanyKeywords,
    pipelineTopN,
    pipelineMinSuitabilityScore,
  } = values;
  const { control, watch, setValue, register } =
    useFormContext<UpdateSettingsInput>();
  const [blockedCompanyKeywordDraft, setBlockedCompanyKeywordDraft] =
    useState("");

  // Watch the current form value to conditionally show/hide penalty input
  const currentPenalizeEnabled =
    watch("penalizeMissingSalary") ?? penalizeMissingSalary.default;

  // Watch auto-skip threshold to show current value
  const currentAutoSkipThreshold = watch("autoSkipScoreThreshold");
  const blockedCompanyKeywordValues =
    watch("blockedCompanyKeywords") ?? blockedCompanyKeywords.default;

  return (
    <SettingsSectionFrame
      mode={layoutMode}
      title="Scoring Settings"
      value="scoring"
    >
      <div className="space-y-4">
        {/* Enable penalty toggle */}
        <div className="flex items-start space-x-3">
          <Controller
            name="penalizeMissingSalary"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="penalizeMissingSalary"
                checked={field.value ?? penalizeMissingSalary.default}
                onCheckedChange={(checked) => {
                  field.onChange(
                    checked === "indeterminate" ? null : checked === true,
                  );
                }}
                disabled={isLoading || isSaving}
              />
            )}
          />
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="penalizeMissingSalary"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              Penalize Missing Salary
            </label>
            <p className="text-xs text-muted-foreground">
              Reduce suitability scores for jobs that do not include salary
              information. Jobs with any salary text (including "Competitive")
              are not penalized.
            </p>
          </div>
        </div>

        {/* Penalty amount input - only shown when enabled */}
        {currentPenalizeEnabled && (
          <div className="pl-7">
            <Controller
              name="missingSalaryPenalty"
              control={control}
              render={({ field }) => (
                <SettingsInput
                  label="Penalty Amount"
                  type="number"
                  inputProps={{
                    ...field,
                    inputMode: "numeric",
                    min: 0,
                    max: 100,
                    step: 1,
                    value: field.value ?? missingSalaryPenalty.default,
                    onChange: (event) => {
                      const value = parseInt(event.target.value, 10);
                      if (Number.isNaN(value)) {
                        field.onChange(null);
                      } else {
                        field.onChange(Math.min(100, Math.max(0, value)));
                      }
                    },
                  }}
                  disabled={isLoading || isSaving}
                  helper={`Points to subtract from suitability score (0-100). Default: ${missingSalaryPenalty.default}.`}
                  current={`Effective: ${missingSalaryPenalty.effective} | Default: ${missingSalaryPenalty.default}`}
                />
              )}
            />
          </div>
        )}

        <Separator />

        {/* Auto-skip threshold input */}
        <div className="space-y-3">
          <Controller
            name="autoSkipScoreThreshold"
            control={control}
            render={({ field }) => (
              <SettingsInput
                label="Auto-skip Score Threshold"
                type="number"
                inputProps={{
                  ...field,
                  inputMode: "numeric",
                  min: 0,
                  max: 100,
                  step: 1,
                  value: field.value ?? "",
                  onChange: (event) => {
                    const value = event.target.value;
                    if (value === "" || value === null) {
                      field.onChange(null);
                    } else {
                      const parsed = parseInt(value, 10);
                      if (Number.isNaN(parsed)) {
                        field.onChange(null);
                      } else {
                        field.onChange(Math.min(100, Math.max(0, parsed)));
                      }
                    }
                  },
                  placeholder: "Disabled",
                }}
                disabled={isLoading || isSaving}
                helper="Jobs scoring below this threshold will be automatically skipped during scoring. Leave empty to disable auto-skip. (0-100)"
                current={`Effective: ${currentAutoSkipThreshold === null || currentAutoSkipThreshold === undefined ? "Disabled" : currentAutoSkipThreshold} | Default: ${autoSkipScoreThreshold.default ?? "Disabled"}`}
              />
            )}
          />
        </div>

        <div className="space-y-3">
          <label
            htmlFor="blocked-company-keywords"
            className="text-sm font-medium leading-none"
          >
            Blocked Company Keywords
          </label>
          <TokenizedInput
            id="blocked-company-keywords"
            values={blockedCompanyKeywordValues}
            draft={blockedCompanyKeywordDraft}
            parseInput={parseTokenizedKeywordInput}
            onDraftChange={setBlockedCompanyKeywordDraft}
            onValuesChange={(value) =>
              setValue("blockedCompanyKeywords", value, { shouldDirty: true })
            }
            placeholder='e.g. "recruitment", "staffing"'
            helperText="Jobs whose company name contains one of these keywords will be dropped during discovery."
            removeLabelPrefix="Remove blocked keyword"
            disabled={isLoading || isSaving}
          />
          <div className="break-words font-mono text-xs text-muted-foreground">
            Effective:{" "}
            {blockedCompanyKeywordValues.length > 0
              ? blockedCompanyKeywordValues.join(", ")
              : "None"}{" "}
            | Default:{" "}
            {blockedCompanyKeywords.default.length > 0
              ? blockedCompanyKeywords.default.join(", ")
              : "None"}
          </div>
        </div>

        <Separator />

        {/* Pipeline yield configuration */}
        <div className="space-y-3">
          <Controller
            control={control}
            name="pipelineTopN"
            render={({ field }) => (
              <SettingsInput
                label="Jobs to process per run"
                type="number"
                disabled={isLoading || isSaving}
                inputProps={{
                  id: "pipeline-top-n",
                  step: 1,
                  min: 1,
                  max: 200,
                  value: field.value ?? "",
                  onChange: field.onChange,
                  onBlur: field.onBlur,
                }}
                helper="How many top-scored jobs the pipeline keeps per run (1–200)."
                current={`Effective: ${pipelineTopN.effective} | Default: ${pipelineTopN.default}`}
              />
            )}
          />

          <Controller
            control={control}
            name="pipelineMinSuitabilityScore"
            render={({ field }) => (
              <SettingsInput
                label="Minimum suitability score"
                type="number"
                disabled={isLoading || isSaving}
                inputProps={{
                  id: "pipeline-min-score",
                  step: 1,
                  min: 0,
                  max: 100,
                  value: field.value ?? "",
                  onChange: field.onChange,
                  onBlur: field.onBlur,
                }}
                helper="Jobs scoring below this are dropped (0–100). Lower = more results but lower quality."
                current={`Effective: ${pipelineMinSuitabilityScore.effective} | Default: ${pipelineMinSuitabilityScore.default}`}
              />
            )}
          />
        </div>

        <Separator />

        {/* Effective/Default values display */}
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Penalty Enabled</div>
            <div className="break-words font-mono text-xs">
              Effective: {penalizeMissingSalary.effective ? "Yes" : "No"} |
              Default: {penalizeMissingSalary.default ? "Yes" : "No"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Penalty Amount</div>
            <div className="break-words font-mono text-xs">
              Effective: {missingSalaryPenalty.effective} | Default:{" "}
              {missingSalaryPenalty.default}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              Auto-skip Threshold
            </div>
            <div className="break-words font-mono text-xs">
              Effective: {autoSkipScoreThreshold.effective ?? "Disabled"} |
              Default: {autoSkipScoreThreshold.default ?? "Disabled"}
            </div>
          </div>
        </div>
      </div>
    </SettingsSectionFrame>
  );
};
