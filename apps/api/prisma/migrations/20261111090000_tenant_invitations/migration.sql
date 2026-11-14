-- 임차인 초대(docs/11 임차인 초대 개발 계획 2-1, 명세 4-1).
-- tenant_invitations: 토큰은 sha256 hex만 저장한다. 만료(EXPIRED)는 expires_at으로 조회 때 계산한다.
-- tenant_invitation_documents: 초대와 함께 공유한 계약 서류(수락 뒤 임차인 열람 범위).
-- tenant_invitation_verifications: 본인 확인 세션(쿠키 값의 sha256). 초대를 지우면 함께 지운다.

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELED');

-- CreateTable
CREATE TABLE "tenant_invitations" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "accepted_by" UUID,
    "canceled_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verify_fail_count" INTEGER NOT NULL DEFAULT 0,
    "verify_fail_window_start" TIMESTAMPTZ(3),
    "next_verify_at" TIMESTAMPTZ(3),
    "landlord_alerted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_invitation_documents" (
    "invitation_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,

    CONSTRAINT "tenant_invitation_documents_pkey" PRIMARY KEY ("invitation_id","document_id")
);

-- CreateTable
CREATE TABLE "tenant_invitation_verifications" (
    "id" UUID NOT NULL,
    "id_hash" VARCHAR(64) NOT NULL,
    "invitation_id" UUID NOT NULL,
    "phone_fingerprint" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_invitation_verifications_pkey" PRIMARY KEY ("id")
);

-- Supabase Data API로 열리지 않게 (정책은 만들지 않는다)
ALTER TABLE "tenant_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_invitation_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_invitation_verifications" ENABLE ROW LEVEL SECURITY;

-- CreateIndex
CREATE UNIQUE INDEX "tenant_invitations_token_hash_key" ON "tenant_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "tenant_invitations_contract_id_created_at_idx" ON "tenant_invitations"("contract_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tenant_invitation_documents_document_id_idx" ON "tenant_invitation_documents"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_invitation_verifications_id_hash_key" ON "tenant_invitation_verifications"("id_hash");

-- CreateIndex
CREATE INDEX "tenant_invitation_verifications_invitation_id_idx" ON "tenant_invitation_verifications"("invitation_id");

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitations" ADD CONSTRAINT "tenant_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitation_documents" ADD CONSTRAINT "tenant_invitation_documents_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "tenant_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitation_documents" ADD CONSTRAINT "tenant_invitation_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitation_verifications" ADD CONSTRAINT "tenant_invitation_verifications_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "tenant_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Prisma로 표현되지 않는 제약 (ex_contract_period·uq_ownership_active_user 관례) ──────
-- 계약당 대기 중(PENDING) 초대 하나 — 동시 재발급 2건 중 하나는 23505(P2002) → 409.
CREATE UNIQUE INDEX "uq_tenant_invitation_pending" ON "tenant_invitations" ("contract_id") WHERE "status" = 'PENDING';
-- 계약당 수락(ACCEPTED) 초대 하나(명세 4-1).
CREATE UNIQUE INDEX "uq_tenant_invitation_accepted" ON "tenant_invitations" ("contract_id") WHERE "status" = 'ACCEPTED';
