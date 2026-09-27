'use client';

import { useState } from 'react';
import { SaleForm, type CreateSaleResult } from '@/components/sales/sale-form';
import { SaleSaved } from '@/components/sales/sale-saved';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Vender (R4, B-134): venta de mostrador (`source = COUNTER`) sin cliente ni
 * placa. Tras cobrar, la confirmación; "Nueva venta" arranca un carrito vacío.
 */
export default function NewSalePage() {
  const [saved, setSaved] = useState<CreateSaleResult | null>(null);
  // Cambia en cada venta nueva para empezar el formulario de cero.
  const [round, setRound] = useState(0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={saved ? 'Venta cobrada' : 'Vender'}
        subtitle={saved ? undefined : 'Venta de mostrador: sin cliente ni placa'}
        back={{ href: '/dashboard', label: 'Inicio' }}
      />
      {saved ? (
        <SaleSaved
          result={saved}
          onNew={() => {
            setSaved(null);
            setRound((value) => value + 1);
          }}
        />
      ) : (
        <SaleForm key={round} onSaved={setSaved} />
      )}
    </div>
  );
}
