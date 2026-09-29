import { Badge, type BadgeTone } from '@/components/ui/page-header';
import { STOCK_STATUS_LABELS, type StockStatus } from '@/lib/inventory/format';

const TONES: Record<StockStatus, BadgeTone> = {
  untracked: 'neutral',
  'not-counted': 'warning',
  out: 'danger',
  available: 'success',
};

/** Estado de stock con su tono: agotado en rojo, sin conteo en amarillo. */
export function StockBadge({ status }: { status: StockStatus }) {
  return <Badge tone={TONES[status]}>{STOCK_STATUS_LABELS[status]}</Badge>;
}
