import { CircleCheckBig, Clock } from "lucide-react";
import type { EquipmentStatus, RecordStatus } from "@ecl/shared";
import { Badge } from "@/components/ui/badge";

/**
 * Verification green appears here and only here in the whole app — it is the
 * one signal the entire product exists to protect, so it is never spent on a
 * button, a link, or anything decorative.
 */
export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  if (status === "VERIFIED") {
    return (
      <Badge className="border-transparent bg-verify-50 text-verify-700 [a]:hover:bg-verify-50">
        <CircleCheckBig className="size-3" />
        Verified
      </Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-pending-50 text-pending-700 [a]:hover:bg-pending-50">
      <Clock className="size-3" />
      Pending
    </Badge>
  );
}

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  return status === "ACTIVE" ? (
    <Badge variant="secondary">Active</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Retired
    </Badge>
  );
}
