import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * Options for the discovery-time "posted within" filter. Value is hours.
 * "" = no limit. Mirrors the view-side Posted pill presets (24h / 7d / 30d).
 */
const POSTED_WITHIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Any time" },
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
];

interface AutomaticPostedWithinCardProps {
  /** Current window in hours, or "" / null for no limit. */
  postedWithinHours: string;
  onPostedWithinHoursChange: (value: string) => void;
}

export function AutomaticPostedWithinCard({
  postedWithinHours,
  onPostedWithinHoursChange,
}: AutomaticPostedWithinCardProps) {
  const current = POSTED_WITHIN_OPTIONS.some(
    (option) => option.value === (postedWithinHours ?? ""),
  )
    ? postedWithinHours ?? ""
    : "";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Posted within</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="posted-within-select" className="sr-only">
          Posted within
        </Label>
        <select
          id="posted-within-select"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          value={current}
          onChange={(event) => onPostedWithinHoursChange(event.target.value)}
        >
          {POSTED_WITHIN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-sm leading-6 text-muted-foreground">
          Only discover jobs posted within this window. Sources that support it
          (e.g. Indeed/LinkedIn via JobSpy) filter server-side; others are
          filtered after scraping.
        </p>
      </CardContent>
    </Card>
  );
}
