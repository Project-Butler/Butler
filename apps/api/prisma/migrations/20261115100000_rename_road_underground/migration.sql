-- 불리언 칼럼 이름을 Prisma 스키마 컨벤션(is + 형용사)에 맞춘다. 지우고 다시 만들지 않고 이름만 바꿔 데이터는 그대로다.
-- 기본 키(kapt_address_links_pkey)는 칼럼 이름이 바뀌어도 그대로 유지된다. 인덱스 이름만 Prisma 기본 이름에 맞춘다.
ALTER TABLE "kapt_address_links" RENAME COLUMN "road_underground" TO "is_road_underground";
ALTER TABLE "juso_building_links" RENAME COLUMN "road_underground" TO "is_road_underground";
ALTER INDEX "kapt_address_links_road_sigungu_cd_road_name_key_road_under_idx" RENAME TO "kapt_address_links_road_sigungu_cd_road_name_key_is_road_un_idx";
ALTER INDEX "juso_building_links_road_sigungu_cd_road_name_key_road_unde_idx" RENAME TO "juso_building_links_road_sigungu_cd_road_name_key_is_road_u_idx";
