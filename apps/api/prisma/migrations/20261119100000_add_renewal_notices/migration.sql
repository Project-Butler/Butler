-- 갱신 거절 통지 기록(묵시적 갱신 차단, 주택임대차보호법 제6조, #157). 구간·도달 판정은 platform/renewalNotice.js가 계산한다.
-- CreateEnum
CREATE TYPE "renewal_notice_kind" AS ENUM ('REFUSE_RENEWAL', 'CHANGE_TERMS');

-- CreateEnum
CREATE TYPE "renewal_notice_method" AS ENUM ('CERTIFIED_MAIL', 'TEXT_MESSAGE', 'MESSENGER', 'EMAIL', 'IN_PERSON', 'OTHER');

-- CreateTable
CREATE TABLE "renewal_notices" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "kind" "renewal_notice_kind" NOT NULL,
    "method" "renewal_notice_method" NOT NULL,
    "sent_on" DATE NOT NULL,
    "delivered_on" DATE,
    "memo" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renewal_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "renewal_notices_contract_id_created_at_idx" ON "renewal_notices"("contract_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "renewal_notices" ADD CONSTRAINT "renewal_notices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewal_notices" ADD CONSTRAINT "renewal_notices_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Supabase Data API로 열리지 않게(정책은 두지 않는다, backend-convention.md)
ALTER TABLE "renewal_notices" ENABLE ROW LEVEL SECURITY;
