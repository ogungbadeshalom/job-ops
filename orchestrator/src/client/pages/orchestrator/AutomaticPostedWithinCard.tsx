import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Options for the discovery-time "posted within" filter. Value is hours.
 * The "any" sentinel means no limit (Radix SelectItem can't use an empty
 * string value, so we map "" / null <-> "any" at the boundary).
 */
const POSTED_WITHIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "any", label: "Any time" },
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
];

const ANY = "any";

interface AutomaticPostedWithinCardProps {
  /** Current window in hours, or "" / null for no limit. */
  postedWithinHours: string;
  onPostedWithinHoursChange: (value: string) => void;
}

export function AutomaticPostedWithinCard({
  postedWithinHours,
  onPostedWithinHoursChange,
}: AutomaticPostedWithinCardProps) {
  const raw = postedWithinHours ?? "";
  const selectValue = raw === "" || raw === "0" ? ANY : raw;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Posted within</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Select
          aria-label="Posted within"
          value={selectValue}
          onValueChange={(value) =>
            onPostedWithinHoursChange(value === ANY ? "" : value)
          }
        >
          <SelectTrigger
            aria-label="Posted within"
            className="h-9 w-full text-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POSTED_WITHIN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm leading-6 text-muted-foreground">
          Only discover jobs posted within this window. Sources that support it
          (e.g. Indeed/LinkedIn via JobSpy) filter server-side; others are
          filtered after scraping.
        </p>
      </CardContent>
    </Card>
  );
}
