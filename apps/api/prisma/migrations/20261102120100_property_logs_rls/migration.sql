-- 다른 테이블과 같이 Data API에서 읽지 못하게 한다(20261019151509_enable_rls_revoke_data_api).
ALTER TABLE "property_logs" ENABLE ROW LEVEL SECURITY;
