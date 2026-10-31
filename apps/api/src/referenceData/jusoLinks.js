// juso_building_links 묶음 쓰기와 변동분의 단지 주소 칸 고치기(집합 SQL). 전체분·변동분이 같이 쓴다.
// 줄마다 쿼리를 보내지 않는다: 묶음마다 INSERT … SELECT FROM unnest(…) 한 번 + DELETE … = ANY(…) 한 번.
import { toBuildingRoadKey, toRoadAddressText } from './jusoBuildingMatcher.js';

export const BATCH_SIZE = 2000;

const keyOf = (row) => ({
  sigunguCd: row.roadSigunguCd,
  roadNameKey: row.roadNameKey,
  underground: row.roadUnderground,
  mainNo: row.roadMainNo,
  subNo: row.roadSubNo,
});

// 바뀐 도로명 키 모음(단지 kaptCode 다시 채우기 대상). 같은 키는 한 번만.
export const createKeySet = () => {
  const map = new Map();
  return {
    add: (key) => {
      if (!key) return;
      map.set(`${key.sigunguCd}|${key.roadNameKey}|${key.underground}|${key.mainNo}|${key.subNo}`, key);
    },
    values: () => [...map.values()],
    get size() {
      return map.size;
    },
  };
};

// upserts: matchBuilding 결과 배열, deletes: 건물관리번호 배열(둘은 겹치지 않음).
// 값이 같은 행은 고치지 않는다(같은 파일을 다시 적용해도 바뀌는 행 0). keySet에는 옛 키 + 새 키를 넣는다.
// markRun(전체분): 값이 같아도 import_run_id를 이번 실행으로 바꾼다(mark-and-sweep).
export const writeLinkBatch = async (
  tx,
  { upserts, deletes, runId = null, fileDate = null, keySet = null, markRun = false },
) => {
  const touched = [...upserts.map((link) => link.buildingMgtNo), ...deletes];
  if (keySet && touched.length > 0) {
    const before = await tx.$queryRaw`
      SELECT road_sigungu_cd AS "roadSigunguCd", road_name_key AS "roadNameKey", road_underground AS "roadUnderground",
             road_main_no AS "roadMainNo", road_sub_no AS "roadSubNo"
      FROM juso_building_links WHERE building_mgt_no = ANY(${touched}::varchar[])`;
    for (const row of before) keySet.add(keyOf(row));
  }

  let upserted = 0;
  if (upserts.length > 0) {
    upserted = await tx.$executeRaw`
      INSERT INTO juso_building_links AS l (building_mgt_no, road_sigungu_cd, road_name_key, road_underground, road_main_no,
        road_sub_no, road_code, kapt_code, match_rule, import_run_id, applied_file_date, updated_at)
      SELECT u.mgt, u.sgg, u.rnk, u.ug, u.mn, u.sn, u.rc, u.kc, u.mr, ${runId}::uuid, ${fileDate}::date, now()
      FROM unnest(
        ${upserts.map((link) => link.buildingMgtNo)}::varchar[],
        ${upserts.map((link) => link.roadSigunguCd)}::varchar[],
        ${upserts.map((link) => link.roadNameKey)}::text[],
        ${upserts.map((link) => link.roadUnderground)}::boolean[],
        ${upserts.map((link) => link.roadMainNo)}::int[],
        ${upserts.map((link) => link.roadSubNo)}::int[],
        ${upserts.map((link) => link.roadCode)}::varchar[],
        ${upserts.map((link) => link.kaptCode)}::varchar[],
        ${upserts.map((link) => link.matchRule)}::varchar[]
      ) AS u(mgt, sgg, rnk, ug, mn, sn, rc, kc, mr)
      ON CONFLICT (building_mgt_no) DO UPDATE SET
        road_sigungu_cd = EXCLUDED.road_sigungu_cd, road_name_key = EXCLUDED.road_name_key,
        road_underground = EXCLUDED.road_underground, road_main_no = EXCLUDED.road_main_no,
        road_sub_no = EXCLUDED.road_sub_no, road_code = EXCLUDED.road_code, kapt_code = EXCLUDED.kapt_code,
        match_rule = EXCLUDED.match_rule, import_run_id = EXCLUDED.import_run_id,
        applied_file_date = EXCLUDED.applied_file_date, updated_at = now()
      WHERE (l.road_sigungu_cd, l.road_name_key, l.road_underground, l.road_main_no, l.road_sub_no, l.road_code,
             l.kapt_code, l.match_rule)
        IS DISTINCT FROM (EXCLUDED.road_sigungu_cd, EXCLUDED.road_name_key, EXCLUDED.road_underground,
             EXCLUDED.road_main_no, EXCLUDED.road_sub_no, EXCLUDED.road_code, EXCLUDED.kapt_code, EXCLUDED.match_rule)
        OR (${markRun} AND l.import_run_id IS DISTINCT FROM EXCLUDED.import_run_id)`;
    if (keySet) for (const link of upserts) keySet.add(keyOf(link));
  }

  let deleted = 0;
  if (deletes.length > 0) {
    deleted = await tx.$executeRaw`DELETE FROM juso_building_links WHERE building_mgt_no = ANY(${deletes}::varchar[])`;
  }
  return { upserted, deleted };
};

// 도로명 변경(공식 연계 100005): 같은 도로명코드의 연결 행 road_name_key와 단지(complexes)의 도로명·키·주소 글자를 함께 고친다.
// 단지 kapt_code 다시 채우기가 연결 표와 단지의 키를 맞춰 보므로 한쪽만 고치면 단지 코드가 지워진다(옛 키·새 키 모두 keySet에).
// renames: [{ roadCode, roadName, roadNameKey }]. 값이 같은 행은 고치지 않는다(이어 하기에서 다시 돌아도 바뀌는 행 0).
export const applyRoadRenames = async (tx, renames, keySet = null) => {
  if (renames.length === 0) return { renamedLinks: 0, renamedComplexes: 0 };
  const codes = renames.map((rename) => rename.roadCode);
  const names = renames.map((rename) => rename.roadName);
  const keys = renames.map((rename) => rename.roadNameKey);
  if (keySet) {
    const before = await tx.$queryRaw`
      SELECT DISTINCT l.road_sigungu_cd AS "roadSigunguCd", l.road_name_key AS "roadNameKey", l.road_underground AS "roadUnderground",
             l.road_main_no AS "roadMainNo", l.road_sub_no AS "roadSubNo"
      FROM juso_building_links l JOIN unnest(${codes}::varchar[], ${keys}::text[]) AS u(rc, rnk) ON l.road_code = u.rc
      WHERE l.road_name_key IS DISTINCT FROM u.rnk`;
    for (const row of before) keySet.add(keyOf(row));
  }
  const links = await tx.$queryRaw`
    UPDATE juso_building_links l SET road_name_key = u.rnk, updated_at = now()
    FROM unnest(${codes}::varchar[], ${keys}::text[]) AS u(rc, rnk)
    WHERE l.road_code = u.rc AND l.road_name_key IS DISTINCT FROM u.rnk
    RETURNING l.road_sigungu_cd AS "roadSigunguCd", l.road_name_key AS "roadNameKey", l.road_underground AS "roadUnderground",
      l.road_main_no AS "roadMainNo", l.road_sub_no AS "roadSubNo"`;
  if (keySet) for (const row of links) keySet.add(keyOf(row));
  // 주소 글자는 옛 도로명이 처음 나오는 한 곳만 새 이름으로 바꾼다(건물명 괄호 안 같은 글자는 그대로).
  // SET 식의 c.road_name은 바꾸기 전 값. 키는 같고 이름만 바뀐 경우(띄어쓰기 등)도 고친다.
  const complexes = await tx.$queryRaw`
    UPDATE complexes c SET road_name = u.rn, road_name_key = u.rnk,
      road_address = CASE
        WHEN c.road_name IS NULL OR c.road_address IS NULL OR position(c.road_name IN c.road_address) = 0 THEN c.road_address
        ELSE overlay(c.road_address PLACING u.rn FROM position(c.road_name IN c.road_address) FOR char_length(c.road_name))
      END
    FROM unnest(${codes}::varchar[], ${names}::varchar[], ${keys}::text[]) AS u(rc, rn, rnk)
    WHERE c.road_code = u.rc AND (c.road_name_key IS DISTINCT FROM u.rnk OR c.road_name IS DISTINCT FROM u.rn)
    RETURNING c.sigungu_code AS "sigunguCd", c.road_name_key AS "roadNameKey", c.is_underground AS underground,
      c.building_main_no AS "mainNo", c.building_sub_no AS "subNo"`;
  if (keySet) for (const key of complexes) keySet.add(key);
  return { renamedLinks: links.length, renamedComplexes: complexes.length };
};

// 단지 주소 칸에 쓸 값(변동분 줄 → complexes 칸)
export const toComplexAddressColumns = (row) => {
  const key = toBuildingRoadKey(row);
  return {
    buildingMgtNo: row.buildingMgtNo,
    roadAddress: toRoadAddressText(row),
    roadCode: row.roadCode,
    roadName: row.roadName,
    roadNameKey: key.roadNameKey,
    sigunguCode: key.sigunguCd,
    isUnderground: key.underground,
    buildingMainNo: key.mainNo,
    buildingSubNo: key.subNo,
  };
};

// 변동분 추가·변동 줄 중 어떤 단지의 대표 건물관리번호(complexes.building_mgt_no)인 것 → 그 단지의 주소 칸을 고친다.
// 도로명 키가 실제로 달라진 단지만 고치고(source_key는 그대로), 새 키를 keySet에 넣어 kapt_code를 다시 계산하게 한다.
// raw SQL이라 updated_at은 바뀌지 않는다.
export const updateComplexAddresses = async (tx, addressRows, keySet = null) => {
  if (addressRows.length === 0) return 0;
  const columns = addressRows.map(toComplexAddressColumns);
  const changed = await tx.$queryRaw`
    UPDATE complexes c SET road_address = u.addr, road_code = u.rc, road_name = u.rn, road_name_key = u.rnk,
      sigungu_code = u.sgg, is_underground = u.ug, building_main_no = u.mn, building_sub_no = u.sn
    FROM unnest(
      ${columns.map((column) => column.buildingMgtNo)}::varchar[],
      ${columns.map((column) => column.roadAddress)}::text[],
      ${columns.map((column) => column.roadCode)}::varchar[],
      ${columns.map((column) => column.roadName)}::varchar[],
      ${columns.map((column) => column.roadNameKey)}::text[],
      ${columns.map((column) => column.sigunguCode)}::varchar[],
      ${columns.map((column) => column.isUnderground)}::boolean[],
      ${columns.map((column) => column.buildingMainNo)}::int[],
      ${columns.map((column) => column.buildingSubNo)}::int[]
    ) AS u(mgt, addr, rc, rn, rnk, sgg, ug, mn, sn)
    WHERE c.building_mgt_no = u.mgt
      AND (c.road_code, c.road_name_key, c.sigungu_code, c.is_underground, c.building_main_no, c.building_sub_no)
        IS DISTINCT FROM (u.rc, u.rnk, u.sgg, u.ug, u.mn, u.sn)
    RETURNING c.sigungu_code AS "sigunguCd", c.road_name_key AS "roadNameKey", c.is_underground AS underground,
      c.building_main_no AS "mainNo", c.building_sub_no AS "subNo"`;
  if (keySet) for (const key of changed) keySet.add(key);
  return changed.length;
};
