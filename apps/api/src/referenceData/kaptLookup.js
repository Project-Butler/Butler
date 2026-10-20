// matchBuilding이 쓰는 K-apt 쪽 조회 묶음을 DB에서 읽는다. 전체분은 전부, 변동분은 파일에 나온 시군구·법정동만.
// 목록에서 빠진 단지(is_active = false)는 후보에서 뺀다.
import { parseJibunLots } from '../domains/complexes/kaptAddress.js';
import { buildKaptLookup } from './jusoBuildingMatcher.js';

// filter: { sigunguCodes, legalDongCodes } (없으면 전부)
export const loadKaptLookup = async (client, filter = null) => {
  const sigunguCodes = filter?.sigunguCodes ?? null;
  const legalDongCodes = filter?.legalDongCodes ?? null;

  const roadLinks = sigunguCodes
    ? await client.$queryRaw`
        SELECT l.road_sigungu_cd AS "roadSigunguCd", l.road_name_key AS "roadNameKey",
               l.road_underground AS "roadUnderground", l.road_main_no AS "roadMainNo", l.road_sub_no AS "roadSubNo",
               l.kapt_code AS "kaptCode", kc.sale_type AS "saleType"
        FROM kapt_address_links l JOIN kapt_complexes kc ON kc.kapt_code = l.kapt_code AND kc.is_active
        WHERE l.road_sigungu_cd = ANY(${sigunguCodes}::text[])`
    : await client.$queryRaw`
        SELECT l.road_sigungu_cd AS "roadSigunguCd", l.road_name_key AS "roadNameKey",
               l.road_underground AS "roadUnderground", l.road_main_no AS "roadMainNo", l.road_sub_no AS "roadSubNo",
               l.kapt_code AS "kaptCode", kc.sale_type AS "saleType"
        FROM kapt_address_links l JOIN kapt_complexes kc ON kc.kapt_code = l.kapt_code AND kc.is_active`;

  const complexes = legalDongCodes
    ? await client.$queryRaw`
        SELECT kapt_code AS "kaptCode", legal_dong_code AS "legalDongCode", jibun_address AS "jibunAddress", sale_type AS "saleType"
        FROM kapt_complexes WHERE is_active AND jibun_address IS NOT NULL AND legal_dong_code = ANY(${legalDongCodes}::text[])`
    : await client.$queryRaw`
        SELECT kapt_code AS "kaptCode", legal_dong_code AS "legalDongCode", jibun_address AS "jibunAddress", sale_type AS "saleType"
        FROM kapt_complexes WHERE is_active AND jibun_address IS NOT NULL`;

  const lots = complexes.flatMap((complex) =>
    parseJibunLots(complex.jibunAddress).map((lot) => ({
      legalDongCode: complex.legalDongCode,
      mainLot: lot.mainLot,
      subLot: lot.subLot,
      kaptCode: complex.kaptCode,
      saleType: complex.saleType,
    })),
  );
  return buildKaptLookup({ roadLinks, lots });
};
