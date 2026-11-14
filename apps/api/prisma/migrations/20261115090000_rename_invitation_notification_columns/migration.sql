-- 칼럼 이름을 Prisma 스키마 컨벤션에 맞춘다(#122). 지우고 다시 만들지 않고 이름만 바꿔 데이터는 그대로다.
-- 사용자 FK는 역할 + _id, 다형 참조는 resource_type + resource_id.
ALTER TABLE "tenant_invitations" RENAME COLUMN "created_by" TO "created_by_id";
ALTER TABLE "tenant_invitations" RENAME COLUMN "accepted_by" TO "accepted_by_id";
ALTER TABLE "tenant_invitations" RENAME CONSTRAINT "tenant_invitations_created_by_fkey" TO "tenant_invitations_created_by_id_fkey";
ALTER TABLE "tenant_invitations" RENAME CONSTRAINT "tenant_invitations_accepted_by_fkey" TO "tenant_invitations_accepted_by_id_fkey";

ALTER TABLE "notifications" RENAME COLUMN "related_type" TO "resource_type";
ALTER TABLE "notifications" RENAME COLUMN "related_id" TO "resource_id";
