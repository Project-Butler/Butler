-- 하우스 로그 개편 새 2단계 P-4a2(docs 15 2단계 계획, H-41): 매도 뒤 판 사람의 숨김과 [목록에서 지우기].

-- AlterTable
ALTER TABLE "ownerships" ADD COLUMN     "removed_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "property_log_hides" (
    "user_id" UUID NOT NULL,
    "log_id" UUID NOT NULL,
    "ownership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_log_hides_pkey" PRIMARY KEY ("user_id","log_id")
);

-- CreateIndex
CREATE INDEX "property_log_hides_log_id_idx" ON "property_log_hides"("log_id");

-- CreateIndex
CREATE INDEX "property_log_hides_ownership_id_idx" ON "property_log_hides"("ownership_id");

-- AddForeignKey
ALTER TABLE "property_log_hides" ADD CONSTRAINT "property_log_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_log_hides" ADD CONSTRAINT "property_log_hides_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "property_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_log_hides" ADD CONSTRAINT "property_log_hides_ownership_id_fkey" FOREIGN KEY ("ownership_id") REFERENCES "ownerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

