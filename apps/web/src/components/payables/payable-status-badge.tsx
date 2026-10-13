import { Badge, type BadgeTone } from '@/components/ui/page-header';
import { STATUS_LABELS, type PayableStatus } from '@/lib/payables/format';

const TONES: Record<PayableStatus, BadgeTone> = {
  PENDING: 'neutral',
  PARTIAL: 'warning',
  OVERDUE: 'danger',
  PAID: 'success',
  VOIDED: 'neutral',
};

/** Estado de una deuda con el `Badge` del sistema (el tono acompaña al texto). */
export function PayableStatusBadge({
  status,
  className,
}: {
  status: PayableStatus;
  className?: string;
}) {
  return (
    <Badge tone={TONES[status]} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
