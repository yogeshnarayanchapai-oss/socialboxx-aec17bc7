import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

function formatCount(value: string | number): string {
  // If value is a string with a suffix like "78%", return as-is
  if (typeof value === "string" && /[^0-9.,\s-]/.test(value)) return value;
  const num = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (isNaN(num)) return String(value);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1) + "k";
  return String(num);
}

interface SplitMetric {
  label: string;
  value: string | number;
}

interface MetricCardProps {
  title: string;
  value?: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  href?: string;
  split?: { primary: SplitMetric; secondary: SplitMetric };
}

export function MetricCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "text-primary",
  href,
  split,
}: MetricCardProps) {
  const navigate = useNavigate();
  return (
    <div
      className={cn("metric-card animate-fade-in", href && "cursor-pointer hover:shadow-md transition-shadow")}
      onClick={() => href && navigate(href)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</p>

          {split ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
              <div className="min-w-0">
                <p className="text-lg sm:text-2xl font-bold tracking-tight leading-none">
                  {formatCount(split.primary.value)}
                </p>
                <p className="mt-1 text-[10px] sm:text-xs text-muted-foreground truncate">
                  {split.primary.label}
                </p>
              </div>
              <div className="min-w-0 border-l border-border pl-2 sm:pl-3">
                <p className="text-lg sm:text-2xl font-bold tracking-tight leading-none">
                  {formatCount(split.secondary.value)}
                </p>
                <p className="mt-1 text-[10px] sm:text-xs text-muted-foreground truncate">
                  {split.secondary.label}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold tracking-tight">{formatCount(value ?? 0)}</p>
              {change && (
                <p
                  className={cn(
                    "mt-1 text-xs font-medium truncate",
                    changeType === "positive" && "text-success",
                    changeType === "negative" && "text-destructive",
                    changeType === "neutral" && "text-muted-foreground"
                  )}
                >
                  {change}
                </p>
              )}
            </>
          )}
        </div>
        <div className={cn("rounded-lg bg-muted p-2 sm:p-2.5 flex-shrink-0", iconColor)}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
    </div>
  );
}
