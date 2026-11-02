-- 노션 6번 10·12·16장: tickets 칸 추가, uploads 신설, documents를 업로드 기반 다형 참조로 재설계,
-- ownerships 증빙 문서 FK, 계약 기간 겹침 제약(ex_contract_period), 미연결 문서 정리용 인덱스.
-- tickets·documents는 아직 코드에서 쓰지 않아 비어 있어야 한다(NOT NULL 칸 추가·documents 칸 삭제).

-- ── 전제 조건 ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tickets") THEN
    RAISE EXCEPTION 'tickets에 행이 있어 NOT NULL 칸을 추가할 수 없습니다. 행을 옮길 방법을 먼저 정하세요.';
  END IF;
  IF EXISTS (SELECT 1 FROM "documents") THEN
    RAISE EXCEPTION 'documents에 행이 있어 property_id·file_url을 지울 수 없습니다. 행을 옮길 방법을 먼저 정하세요.';
  END IF;
END $$;

-- ── documents ─────────────────────────────────────────
ALTER TABLE "documents" DROP CONSTRAINT "documents_property_id_fkey";

ALTER TABLE "documents" DROP COLUMN "file_url",
DROP COLUMN "property_id",
ADD COLUMN     "attached_at" TIMESTAMPTZ(3),
ADD COLUMN     "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "file_name" TEXT NOT NULL,
ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mime_type" TEXT NOT NULL,
ADD COLUMN     "resource_id" UUID,
ADD COLUMN     "resource_type" VARCHAR(40),
ADD COLUMN     "size_bytes" BIGINT NOT NULL,
ADD COLUMN     "storage_path" TEXT NOT NULL,
ADD COLUMN     "upload_id" UUID NOT NULL,
ADD COLUMN     "uploader_id" UUID NOT NULL,
ALTER COLUMN "type" SET DATA TYPE VARCHAR(40);

-- ── tickets ───────────────────────────────────────────
ALTER TABLE "tickets" ADD COLUMN     "category" VARCHAR(30) NOT NULL,
ADD COLUMN     "closed_at" TIMESTAMPTZ(3),
ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "cost" BIGINT,
ADD COLUMN     "log_id" UUID,
ADD COLUMN     "ownership_id" UUID NOT NULL,
ADD COLUMN     "requester_id" UUID NOT NULL,
ADD COLUMN     "resolution_note" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL;

-- ── uploads ───────────────────────────────────────────
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "storage_path" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- Supabase Data API로 열리지 않게 (정책은 만들지 않는다)
ALTER TABLE "uploads" ENABLE ROW LEVEL SECURITY;

-- ── 인덱스 ────────────────────────────────────────────
CREATE INDEX "uploads_user_id_idx" ON "uploads"("user_id");
CREATE UNIQUE INDEX "documents_upload_id_key" ON "documents"("upload_id");
CREATE INDEX "documents_resource_type_resource_id_idx" ON "documents"("resource_type", "resource_id");
CREATE INDEX "documents_uploader_id_idx" ON "documents"("uploader_id");
CREATE INDEX "tickets_property_id_idx" ON "tickets"("property_id");
CREATE INDEX "tickets_ownership_id_idx" ON "tickets"("ownership_id");
CREATE INDEX "tickets_contract_id_idx" ON "tickets"("contract_id");
CREATE INDEX "tickets_requester_id_idx" ON "tickets"("requester_id");

-- ── FK ────────────────────────────────────────────────
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_evidence_document_id_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ownership_id_fkey" FOREIGN KEY ("ownership_id") REFERENCES "ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Prisma로 표현되지 않는 제약 (노션 6번 16장) ──────
-- 같은 소유 관계 안에서 해지 안 된 계약끼리 기간 겹침 금지 → 계약 409 CONTRACT_PERIOD_OVERLAP.
-- 서비스 검사만으로는 동시 요청에 뚫려서 DB가 보장한다. 위반하면 SQLSTATE 23P01(exclusion_violation).
-- uuid에 = 를 GiST로 쓰려면 btree_gist가 필요하다. Supabase처럼 확장은 extensions 스키마에 둔다.
CREATE SCHEMA IF NOT EXISTS "extensions";
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";
ALTER TABLE "contracts" ADD CONSTRAINT "ex_contract_period"
  EXCLUDE USING gist ("ownership_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&)
  WHERE ("terminated_on" IS NULL);

-- 24시간 지난 미연결 문서 정리용
CREATE INDEX "ix_documents_unattached" ON "documents" ("created_at")
  WHERE "resource_type" IS NULL AND "deleted_at" IS NULL;
