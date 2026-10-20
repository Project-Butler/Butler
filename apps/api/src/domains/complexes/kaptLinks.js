// 도로명 키 → K-apt 단지 연결 조회(검색 보조·resolve의 kaptCode 공통).
// 두 연결 표(kapt_address_links, juso_building_links)를 합쳐 kapt_complexes와 붙인다.
// 목록에서 사라진 단지(is_active = false)는 빼고, rank는 칸으로 두지 않고 sale_type으로 계산한다.
import { toRoadNameKey } from './kaptAddress.js';

// 분양·혼합 0, 임대 1, 그 밖·모름 2 — 한 주소에 단지가 여럿이면 분양·혼합이 임대보다 앞.
export const rankSaleType = (saleType) => {
  const text = String(saleType ?? '').trim();
  if (text === '분양' || text === '혼합') return 0;
  if (text === '임대') return 1;
  return 2;
};

// 후보 행([{ kaptCode, name, saleType }]) 중 rank가 가장 작은 것, 같으면 kaptCode 오름차순 하나.
export const pickBestKapt = (rows) => {
  let best = null;
  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }
    const diff = rankSaleType(row.saleType) - rankSaleType(best.saleType);
    if (diff < 0 || (diff === 0 && row.kaptCode < best.kaptCode)) best = row;
  }
  return best ? { kaptCode: best.kaptCode, name: best.name, saleType: best.saleType ?? null } : null;
};

const toNonNegativeInt = (value) => {
  const number = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isInteger(number) && number >= 0 ? number : null;
};

// juso 칸(검색 저장본 payload 모양) → 텍스트 도로명 키. 칸이 모자라면 null.
// 시군구는 법정동 코드(admCd) 앞 5자리 — K-apt 쪽 키(kaptAddress.parseRoadAddress)와 같은 방식.
export const toRoadLinkKey = (payload) => {
  const admCd = String(payload?.admCd ?? '');
  const roadNameKey = toRoadNameKey(payload?.rn);
  const mainNo = toNonNegativeInt(payload?.buldMnnm);
  const subNo = toNonNegativeInt(payload?.buldSlno ?? 0);
  if (!/^\d{10}$/.test(admCd) || !roadNameKey || mainNo === null || subNo === null) return null;
  return {
    sigunguCd: admCd.slice(0, 5),
    roadNameKey,
    underground: String(payload.udrtYn) === '1',
    mainNo,
    subNo,
  };
};

// keys: 도로명 키 배열(null 허용). 결과: keys와 같은 길이의 배열({ kaptCode, name, saleType } 또는 null).
// 쿼리는 한 번. 연결 표가 비어 있으면 모두 null.
export const findKaptByRoadKeys = async (client, keys) => {
  const indexed = keys.map((key, index) => ({ key, index })).filter(({ key }) => key);
  const result = keys.map(() => null);
  if (indexed.length === 0) return result;

  const rows = await client.$queryRaw`
    SELECT k.idx, kc.kapt_code AS "kaptCode", kc.name, kc.sale_type AS "saleType"
    FROM unnest(
      ${indexed.map(({ index }) => index)}::int[],
      ${indexed.map(({ key }) => key.sigunguCd)}::text[],
      ${indexed.map(({ key }) => key.roadNameKey)}::text[],
      ${indexed.map(({ key }) => key.underground)}::boolean[],
      ${indexed.map(({ key }) => key.mainNo)}::int[],
      ${indexed.map(({ key }) => key.subNo)}::int[]
    ) AS k(idx, sgg, rnk, ug, mn, sn)
    JOIN (
      SELECT road_sigungu_cd, road_name_key, road_underground, road_main_no, road_sub_no, kapt_code FROM kapt_address_links
      UNION ALL
      SELECT road_sigungu_cd, road_name_key, road_underground, road_main_no, road_sub_no, kapt_code FROM juso_building_links
    ) l ON l.road_sigungu_cd = k.sgg AND l.road_name_key = k.rnk AND l.road_underground = k.ug
       AND l.road_main_no = k.mn AND l.road_sub_no = k.sn
    JOIN kapt_complexes kc ON kc.kapt_code = l.kapt_code AND kc.is_active`;

  const candidates = new Map();
  for (const row of rows) {
    const list = candidates.get(row.idx) ?? [];
    list.push(row);
    candidates.set(row.idx, list);
  }
  for (const [index, list] of candidates) result[index] = pickBestKapt(list);
  return result;
};
