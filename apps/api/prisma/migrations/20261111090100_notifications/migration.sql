-- 인앱 알림(api-contract.md 7장 "알림"). 쓰기는 platform/notify.js의 notify()로만 한다.
-- type은 등록형 문자열이라 enum이 아니다. related_type + related_id는 아무 리소스나 가리키므로 FK가 없다.
-- TODO: 90일 보관 정리.

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "related_type" VARCHAR(40),
    "related_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Supabase Data API로 열리지 않게 (정책은 만들지 않는다)
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
