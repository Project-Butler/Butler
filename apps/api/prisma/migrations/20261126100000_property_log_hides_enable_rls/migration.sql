-- 20261124110000_house_log_seller_hide_remove에서 만든 property_log_hides에 빠진 RLS를 켠다.
-- Supabase Data API로 열리지 않게(정책은 두지 않는다, backend-convention.md)
ALTER TABLE "property_log_hides" ENABLE ROW LEVEL SECURITY;
