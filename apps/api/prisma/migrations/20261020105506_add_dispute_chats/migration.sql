-- CreateEnum
CREATE TYPE "dispute_chat_role" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "dispute_chats" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dispute_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_chat_messages" (
    "id" UUID NOT NULL,
    "chat_id" UUID NOT NULL,
    "role" "dispute_chat_role" NOT NULL,
    "content" TEXT NOT NULL,
    "reference_ids" UUID[],
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dispute_chats_user_id_updated_at_idx" ON "dispute_chats"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "dispute_chat_messages_chat_id_created_at_idx" ON "dispute_chat_messages"("chat_id", "created_at");

-- AddForeignKey
ALTER TABLE "dispute_chat_messages" ADD CONSTRAINT "dispute_chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "dispute_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Supabase Data API로 테이블이 열리지 않게 RLS를 켠다 (README "DB 작업 규칙", Issue #10).
ALTER TABLE "dispute_chats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispute_chat_messages" ENABLE ROW LEVEL SECURITY;
