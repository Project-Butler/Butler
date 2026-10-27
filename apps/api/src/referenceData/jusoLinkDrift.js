// 드리프트 점검(월 1회, A팀 로컬 CLI juso-link:drift). 공식 연계는 건물DB에만 있는 변경(공동주택 여부만 바뀜 등)을 못 보므로,
// 건물DB 전체분으로 "지금 다시 적재하면 나올 연결"을 계산해(쓰기 없음) 지금 juso_building_links와 비교한다.
// 비교는 단지 코드 + 도로명 키만(규칙 이름은 공식 연계가 모를 때 NON_APT_FLAG로 남겨서 보지 않는다).
// 차이 비율이 기준을 넘으면 전체분 복구 적재(import:juso-buildings)를 권한다.
import { roadKeyId } from './jusoBuildingMatcher.js';
import { decodeLines, openFullSource } from './jusoFiles.js';
import { collectFullLinks } from './jusoFullLoad.js';
import { loadKaptLookup } from './kaptLookup.js';

export const DRIFT_RELOAD_RATIO = 0.005;
const MAX_SAMPLES = 20;

const outcomeId = (link) =>
  `${link.kaptCode}|${roadKeyId({
    sigunguCd: link.roadSigunguCd,
    roadNameKey: link.roadNameKey,
    underground: link.roadUnderground,
    mainNo: link.roadMainNo,
    subNo: link.roadSubNo,
  })}`;

// fullLinks: Map(건물관리번호 → 연결 행, 전체분 계산), dbRows: 지금 표 행 배열
export const compareDriftLinks = (fullLinks, dbRows) => {
  const onlyInDb = [];
  const changed = [];
  const seen = new Set();
  for (const row of dbRows) {
    seen.add(row.buildingMgtNo);
    const full = fullLinks.get(row.buildingMgtNo);
    if (!full) onlyInDb.push(row.buildingMgtNo);
    else if (outcomeId(full) !== outcomeId(row)) changed.push(row.buildingMgtNo);
  }
  const onlyInFull = [...fullLinks.keys()].filter((id) => !seen.has(id));
  const diffCount = onlyInDb.length + changed.length + onlyInFull.length;
  const ratio = diffCount / Math.max(fullLinks.size, 1);
  return {
    fullLinks: fullLinks.size,
    dbLinks: dbRows.length,
    onlyInFull: onlyInFull.length,
    onlyInDb: onlyInDb.length,
    changed: changed.length,
    ratio,
    reloadRecommended: ratio > DRIFT_RELOAD_RATIO,
    samples: { onlyInFull: onlyInFull.slice(0, MAX_SAMPLES), onlyInDb: onlyInDb.slice(0, MAX_SAMPLES), changed: changed.slice(0, MAX_SAMPLES) },
  };
};

async function* allLines(source) {
  for (const file of source.buildFiles) yield* decodeLines(await file.open());
}

export const runJusoDrift = async ({ prisma, sourcePath, log = () => {} }) => {
  const source = await openFullSource(sourcePath);
  try {
    const lookup = await loadKaptLookup(prisma);
    log(`K-apt 조회: 도로명 키 ${lookup.size.roadKeys}, 번지 키 ${lookup.size.lotKeys}`);
    const collected = await collectFullLinks(allLines(source), lookup);
    log(`전체분 계산: ${collected.rowsRead}줄, 연결 ${collected.links.size}행`);
    const dbRows = await prisma.$queryRaw`
      SELECT building_mgt_no AS "buildingMgtNo", road_sigungu_cd AS "roadSigunguCd", road_name_key AS "roadNameKey",
             road_underground AS "roadUnderground", road_main_no AS "roadMainNo", road_sub_no AS "roadSubNo", kapt_code AS "kaptCode"
      FROM juso_building_links`;
    return { rowsRead: collected.rowsRead, ...compareDriftLinks(collected.links, dbRows) };
  } finally {
    source.close();
  }
};
