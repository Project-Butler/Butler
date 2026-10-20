// 단지(complexes) kapt_code 다시 채우기. 연결 표(kapt_address_links·juso_building_links)가 바뀐 뒤 짧은 별도 트랜잭션에서
// 집합 UPDATE 한 번으로 한다. 엑셀·전체분 적재·변동분·기본정보 채우기가 같이 쓴다.

// 단지 kapt_code 다시 채우기: 도로명 키가 같은 두 연결 표의 행 → 활성 kapt_complexes, 분양·혼합 > 임대 > 그 밖,
// 같으면 kapt_code 오름차순(kaptLinks.findKaptByRoadKeys와 같은 규칙). 값이 달라지는 단지만 UPDATE(raw SQL이라 updated_at 그대로).
// keys가 null이면 도로명 키가 있는 모든 단지, 배열이면 그 키의 단지만.
export const refillComplexKaptCodes = async (client, keys = null) => {
  if (Array.isArray(keys) && keys.length === 0) return 0;
  const sggs = keys ? keys.map((key) => key.sigunguCd) : [];
  const rnks = keys ? keys.map((key) => key.roadNameKey) : [];
  const ugs = keys ? keys.map((key) => key.underground) : [];
  const mns = keys ? keys.map((key) => key.mainNo) : [];
  const sns = keys ? keys.map((key) => key.subNo) : [];
  return client.$executeRaw`
    UPDATE complexes c SET kapt_code = b.kapt_code
    FROM (
      SELECT c2.id, (
        SELECT kc.kapt_code
        FROM (
          SELECT l.kapt_code FROM kapt_address_links l
          WHERE l.road_sigungu_cd = c2.sigungu_code AND l.road_name_key = c2.road_name_key
            AND l.road_underground = c2.is_underground AND l.road_main_no = c2.building_main_no AND l.road_sub_no = c2.building_sub_no
          UNION ALL
          SELECT j.kapt_code FROM juso_building_links j
          WHERE j.road_sigungu_cd = c2.sigungu_code AND j.road_name_key = c2.road_name_key
            AND j.road_underground = c2.is_underground AND j.road_main_no = c2.building_main_no AND j.road_sub_no = c2.building_sub_no
        ) u
        JOIN kapt_complexes kc ON kc.kapt_code = u.kapt_code AND kc.is_active
        ORDER BY CASE WHEN btrim(kc.sale_type) IN ('분양', '혼합') THEN 0 WHEN btrim(kc.sale_type) = '임대' THEN 1 ELSE 2 END,
          kc.kapt_code
        LIMIT 1
      ) AS kapt_code
      FROM complexes c2
      WHERE c2.road_name_key IS NOT NULL AND c2.sigungu_code IS NOT NULL AND c2.is_underground IS NOT NULL
        AND c2.building_main_no IS NOT NULL AND c2.building_sub_no IS NOT NULL
        AND (${keys === null} OR (c2.sigungu_code, c2.road_name_key, c2.is_underground, c2.building_main_no, c2.building_sub_no)
          IN (SELECT * FROM unnest(${sggs}::varchar[], ${rnks}::text[], ${ugs}::boolean[], ${mns}::int[], ${sns}::int[])))
    ) b
    WHERE b.id = c.id AND c.kapt_code IS DISTINCT FROM b.kapt_code`;
};
