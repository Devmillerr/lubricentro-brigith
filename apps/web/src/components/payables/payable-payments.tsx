'use client';

import { useState, type FormEvent } from 'react';
import { FormError } from '@/components/customers/form-error';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api, type Schemas } from '@/lib/api/client';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { callApi, failureMessage, type ApiFailure } from '@/lib/api/request';
import { localDateInputValue } from '@/lib/inventory/receipts';
import { formatAmount, formatDay, type Currency, type PayableDetail } from '@/lib/payables/format';
import { parsePrice } from '@/lib/sales/format';

type Payment = PayableDetail['payments'][number];
type Method = Schemas['SupplierPaymentMethod'];

const METHOD_LABELS: Record<Method, string> = {
  CASH: 'Efectivo',
  YAPE: 'Yape',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

const ERRORS = {
  byCode: {
    PAYABLE_VOIDED: 'La deuda está anulada: no recibe pagos.',
    PAYABLE_NOT_OPEN: 'La deuda ya está pagada.',
    PAYMENT_TOO_SMALL: 'El pago es tan pequeño que redondea a 0 en la moneda de la deuda.',
    SETTLEMENT_MISMATCH:
      'Solo se cancela el saldo con una diferencia de redondeo de hasta un céntimo.',
    PAYMENT_ALREADY_VOIDED: 'Ese pago ya estaba anulado.',
  },
};

/** Vista previa del monto aplicado (la API decide con decimales exactos). */
function previewApplied(
  amount: number,
  pay: Currency,
  debt: Currency,
  rate: number | null,
): number | null {
  if (pay === debt) return amount;
  if (!rate || rate <= 0) return null;
  const raw = debt === 'USD' ? amount / rate : amount * rate;
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

/**
 * Pagos de una deuda (R8, DEC-99, DEC-100): lo entregado, su moneda, el tipo
 * de cambio y lo aplicado; la diferencia cambiaria informativa; el registro de
 * un pago y su anulación (nunca se edita).
 */
export function PayablePayments({
  payable,
  onChanged,
}: {
  payable: PayableDetail;
  onChanged: () => void;
}) {
  const open = ['PENDING', 'PARTIAL', 'OVERDUE'].includes(payable.status);
  const total = payable.fxDifferenceTotal;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">Pagos</h3>
      {payable.payments.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Todavía no hay pagos.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm">
          {payable.payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              payable={payable}
              payment={payment}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      {total.applicableCount > 0 && (
        <p className="text-sm">
          {total.amountPen === null
            ? 'Diferencia cambiaria: no se puede calcular (la deuda no tiene tipo de cambio de referencia).'
            : total.calculatedCount === total.applicableCount
              ? `Diferencia cambiaria total: ${signed(total.amountPen)} (informativa)`
              : `Diferencia cambiaria calculada en ${total.calculatedCount} de ${total.applicableCount} pagos: ${signed(total.amountPen)}`}
        </p>
      )}
      {open && <PaymentForm payable={payable} onSaved={onChanged} />}
    </section>
  );
}

function signed(amountPen: string): string {
  const value = Number(amountPen);
  return `${value > 0 ? '+' : ''}${formatAmount(amountPen, 'PEN')}`;
}

function PaymentRow({
  payable,
  payment,
  onChanged,
}: {
  payable: PayableDetail;
  payment: Payment;
  onChanged: () => void;
}) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const idempotency = useIdempotencyKey();
  const fx = payment.fxDifference;

  async function confirmVoid() {
    if (reason.trim().length < 3 || saving) return;
    setSaving(true);
    setFailure(null);
    const body = { reason: reason.trim() };
    const result = await callApi(
      api.POST('/payables/{id}/payments/{paymentId}/void', {
        params: {
          path: { id: payable.id, paymentId: payment.id },
          header: { 'Idempotency-Key': idempotency.keyFor({ paymentId: payment.id, ...body }) },
        },
        body,
      }),
    );
    setSaving(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    idempotency.reset();
    onChanged();
  }

  return (
    <li className={`flex flex-col gap-1 px-4 py-3 ${payment.voidedAt ? 'opacity-70' : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">
          {formatDay(payment.paidOn)} · {METHOD_LABELS[payment.method as Method] ?? payment.method}
        </span>
        <span className={`font-semibold ${payment.voidedAt ? 'line-through' : ''}`}>
          {formatAmount(payment.amountPaid, payment.paymentCurrency)}
        </span>
      </div>
      {payment.exchangeRate && (
        <span className="text-xs text-[var(--muted-foreground)]">
          T. C. {payment.exchangeRate} → aplicado{' '}
          {formatAmount(payment.appliedAmount, payment.debtCurrency)}
        </span>
      )}
      {payment.settlesBalance && (
        <span className="text-xs text-[var(--muted-foreground)]">
          Canceló el saldo: calculado{' '}
          {formatAmount(payment.computedAppliedAmount, payment.debtCurrency)}, aplicado{' '}
          {formatAmount(payment.appliedAmount, payment.debtCurrency)} ({payment.settlementReason})
        </span>
      )}
      {fx.status === 'CALCULATED' && (
        <span className="text-xs text-[var(--muted-foreground)]">
          Diferencia cambiaria: {signed(fx.amountPen!)}{' '}
          {Number(fx.amountPen) > 0
            ? '(pagaste más soles que al tipo de cambio de la compra)'
            : Number(fx.amountPen) < 0
              ? '(pagaste menos soles que al tipo de cambio de la compra)'
              : ''}
        </span>
      )}
      {fx.status === 'NOT_CALCULABLE' && (
        <span className="text-xs text-[var(--muted-foreground)]">
          Diferencia cambiaria: no se puede calcular (la deuda no tiene tipo de cambio de
          referencia).
        </span>
      )}
      {payment.reference && (
        <span className="text-xs text-[var(--muted-foreground)]">Ref.: {payment.reference}</span>
      )}
      {payment.voidedAt ? (
        <span className="text-xs text-[var(--danger)]">Anulado: {payment.voidReason}</span>
      ) : voiding ? (
        <div className="flex flex-col gap-2">
          <Input
            aria-label="Motivo de la anulación del pago"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Motivo (ej.: transferencia rechazada)"
          />
          {failure && <FormError>{failureMessage(failure, ERRORS)}</FormError>}
          <div className="flex gap-2">
            <Button
              onClick={confirmVoid}
              disabled={saving || reason.trim().length < 3}
              className="flex-1"
            >
              {saving ? 'Anulando…' : 'Anular pago'}
            </Button>
            <Button variant="outline" onClick={() => setVoiding(false)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setVoiding(true)} className="self-start">
          Anular este pago
        </Button>
      )}
    </li>
  );
}

function PaymentForm({ payable, onSaved }: { payable: PayableDetail; onSaved: () => void }) {
  const today = localDateInputValue(new Date());
  const [paidOn, setPaidOn] = useState(today);
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>('PEN');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [method, setMethod] = useState<Method>('TRANSFER');
  const [reference, setReference] = useState('');
  const [settles, setSettles] = useState(false);
  const [settleReason, setSettleReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const idempotency = useIdempotencyKey();

  const sameCurrency = paymentCurrency === payable.currency;
  const parsedAmount = parsePrice(amount);
  const parsedRate = /^\d+(\.\d{1,4})?$/.test(rate.trim()) ? Number(rate.trim()) : null;
  const applied =
    parsedAmount === null
      ? null
      : previewApplied(parsedAmount, paymentCurrency, payable.currency, parsedRate);
  const balance = Number(payable.balance);
  const gap = applied === null ? null : Math.round((applied - balance) * 100) / 100;
  const canSettle = !sameCurrency && gap !== null && gap !== 0 && Math.abs(gap) <= 0.01;
  const overpay = gap !== null && gap > 0 && !(settles && canSettle);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (parsedAmount === null || parsedAmount <= 0) {
      setMessage('Escribe el monto pagado (mayor que 0, hasta 2 decimales).');
      return;
    }
    if (!sameCurrency && (parsedRate === null || parsedRate <= 0)) {
      setMessage('Escribe el tipo de cambio del día del pago (soles por 1 dólar).');
      return;
    }
    if (!paidOn || paidOn > today || paidOn < payable.issueDate) {
      setMessage('La fecha del pago debe estar entre la fecha de compra y hoy.');
      return;
    }
    if (settles && canSettle && settleReason.trim().length < 3) {
      setMessage('Escribe por qué se cancela el saldo con esta diferencia.');
      return;
    }
    setMessage(null);
    setFailure(null);
    setSaving(true);
    const body: Schemas['RegisterPaymentDto'] = {
      paidOn,
      paymentCurrency,
      amountPaid: parsedAmount,
      method,
    };
    if (!sameCurrency && parsedRate) body.exchangeRate = parsedRate;
    if (reference.trim()) body.reference = reference.trim();
    if (settles && canSettle) {
      body.settlesBalance = true;
      body.settlementReason = settleReason.trim();
    }
    const result = await callApi(
      api.POST('/payables/{id}/payments', {
        params: {
          path: { id: payable.id },
          header: { 'Idempotency-Key': idempotency.keyFor({ id: payable.id, ...body }) },
        },
        body,
      }),
    );
    setSaving(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    idempotency.reset();
    setAmount('');
    setReference('');
    setSettles(false);
    setSettleReason('');
    onSaved();
  }

  const overpayData =
    failure?.code === 'OVERPAYMENT'
      ? (failure.data as { maxAmountPaid?: string } | undefined)
      : undefined;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h4 className="text-base font-semibold">Registrar pago</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id="pay-date" label="Fecha del pago">
          <Input
            id="pay-date"
            type="date"
            value={paidOn}
            min={payable.issueDate}
            max={today}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </Field>
        <Field id="pay-method" label="Medio de pago">
          <Select
            id="pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
          >
            {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="pay-currency" label="Moneda del pago">
          <Select
            id="pay-currency"
            value={paymentCurrency}
            onChange={(e) => setPaymentCurrency(e.target.value as Currency)}
          >
            <option value="PEN">Soles (S/)</option>
            <option value="USD">Dólares (US$)</option>
          </Select>
        </Field>
        <Field id="pay-amount" label="Monto entregado">
          <Input
            id="pay-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        {!sameCurrency && (
          <Field id="pay-rate" label="Tipo de cambio del pago" hint="Soles por 1 dólar.">
            <Input
              id="pay-rate"
              inputMode="decimal"
              autoComplete="off"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Ej.: 3.7520"
            />
          </Field>
        )}
        <Field id="pay-ref" label="N.º de operación" optional>
          <Input
            id="pay-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
      </div>
      {applied !== null && (
        <p className="text-sm">
          Se aplica a la deuda (estimado):{' '}
          <strong>{formatAmount(applied, payable.currency)}</strong>.
          {!overpay &&
            ` Saldo después: ${formatAmount(
              settles && canSettle ? 0 : Math.max(balance - applied, 0),
              payable.currency,
            )}.`}
        </p>
      )}
      {overpay && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          Supera el saldo ({formatAmount(balance, payable.currency)}).
        </p>
      )}
      {canSettle && (
        <div className="flex flex-col gap-2 rounded-md bg-[var(--accent-soft)] p-3 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={settles}
              onChange={(e) => setSettles(e.target.checked)}
            />
            Cancelar el saldo (diferencia de redondeo de un céntimo)
          </label>
          {settles && (
            <Input
              aria-label="Motivo de la cancelación del saldo"
              value={settleReason}
              onChange={(e) => setSettleReason(e.target.value)}
              maxLength={500}
              placeholder="Motivo (ej.: redondeo del banco)"
            />
          )}
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {message}
        </p>
      )}
      {failure && (
        <FormError>
          {failure.code === 'OVERPAYMENT'
            ? `El pago supera el saldo. Como máximo: ${formatAmount(
                overpayData?.maxAmountPaid ?? '0',
                paymentCurrency,
              )}.`
            : failureMessage(failure, ERRORS)}
        </FormError>
      )}
      <Button type="submit" disabled={saving || overpay}>
        {saving ? 'Guardando…' : 'Registrar pago'}
      </Button>
    </form>
  );
}
