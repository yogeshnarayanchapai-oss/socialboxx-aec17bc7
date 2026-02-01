import { cn } from "@/lib/utils";

type StatusType = "active" | "pending" | "error" | "info" | "success" | "warning";

interface StatusBadgeProps {
  status: StatusType;
  children: React.ReactNode;
  dot?: boolean;
}

const statusStyles: Record<StatusType, string> = {
  active: "bg-success/10 text-success",
  success: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  warning: "bg-warning/10 text-warning",
  error: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export function StatusBadge({ status, children, dot = true }: StatusBadgeProps) {
  return (
    <span className={cn("status-badge", statusStyles[status])}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            status === "active" || status === "success" ? "bg-success" : "",
            status === "pending" || status === "warning" ? "bg-warning" : "",
            status === "error" ? "bg-destructive" : "",
            status === "info" ? "bg-info" : ""
          )}
        />
      )}
      {children}
    </span>
  );
}
