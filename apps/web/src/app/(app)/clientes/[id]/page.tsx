import { ClientOnly } from '@/lib/static-route';
import View from './view';

// Export estático: se genera una sola página con el id comodín "_" y el hosting reescribe
// /x/<uuid> a /x/_. En `next dev`/`next start`, cualquier id se sirve con la misma vista.
export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return (
    <ClientOnly>
      <View />
    </ClientOnly>
  );
}
