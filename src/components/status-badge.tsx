import { Badge } from "@/components/ui/badge";
import { TICKET_STATUS, STATUS_COLORS, type TicketStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const color = STATUS_COLORS[status] ?? "#6B7280";
  return (
    <Badge
      variant="outline"
      className={cn("border-0 font-medium", className)}
      style={{ backgroundColor: `${color}1A`, color }}
    >
      {TICKET_STATUS[status] ?? status}
    </Badge>
  );
}
