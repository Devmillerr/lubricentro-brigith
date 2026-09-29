-- Row Level Security en todas las tablas de la aplicación (seguridad previa a
-- la publicación). La API accede solo con Prisma, conectada como el dueño de
-- las tablas, que no está sujeto a RLS; sin políticas, cualquier otro rol
-- (en Supabase: `anon` y `authenticated` vía la API REST) no ve ni modifica
-- ninguna fila. No cambia datos.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenance_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "maintenances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_compatibilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limit_windows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminder_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicle_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wash_price_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wash_types" ENABLE ROW LEVEL SECURITY;
