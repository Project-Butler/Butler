-- Supabase Data API(PostgREST)로 테이블이 열리지 않게 막는다 (Issue #10).
-- 버틀러는 Express + Prisma(postgres 역할, 테이블 소유자)로만 DB에 접근한다.
-- 테이블 소유자에게는 RLS가 적용되지 않으므로, 정책 없이 RLS만 켜도 Prisma 동작은 그대로다.
-- 직접 작성한 마이그레이션이다(Prisma schema로 표현할 수 없음).

-- 1) 모든 테이블 RLS 활성화 (정책 없음 = anon·authenticated는 행을 하나도 볼 수 없음)
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complexes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_ownerships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limit_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispute_references" ENABLE ROW LEVEL SECURITY;

-- 2) Data API 역할(anon, authenticated)의 권한 회수.
--    Supabase에만 있는 역할이라 로컬 Docker Postgres에서는 건너뛴다.
--    기본 권한(default privileges)도 회수해서, 앞으로 postgres가 만드는 테이블에도 권한이 붙지 않게 한다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END
$$;
