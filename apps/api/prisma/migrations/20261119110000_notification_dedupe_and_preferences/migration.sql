-- 계약 일정 알림 정기 작업(#159): 같은 알림을 두 번 만들지 않는 키, 알림 설정(api-contract.md 7장 notification-preferences).
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dedupe_key" VARCHAR(160);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "web_push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "muted_types" VARCHAR(60)[] DEFAULT ARRAY[]::VARCHAR(60)[],
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex(dedupe_key가 null인 이벤트 알림은 겹쳐도 된다 — Postgres unique는 null끼리 같다고 보지 않는다)
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Supabase Data API로 열리지 않게(정책은 두지 않는다, backend-convention.md)
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
