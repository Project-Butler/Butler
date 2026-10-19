// 단지 검색에서 juso 건물을 K-apt 단지에 연결하는 규칙(순수 함수, DB·외부 호출 없음).
// publicProvider.searchComplexes가 DB 조회 결과를 넘겨서 쓴다(COMPLEX_ROAD_MATCH가 켜져 있을 때).
//
// 연결 순서(확실할 때만 연결, 애매하면 PNU 키로 둔다):
//   1. 도로명 구조 키(시군구 5자리·도로명·지하 여부·본번·부번)가 같은 K-apt 단지가 정확히 하나
//   2. 같은 검색 결과 안에서 건물명·리 단위 법정동이 같고 지번 본번이 가까운(±20) 건물이 1번으로 연결된 경우 그 단지
//   3. 같은 법정동(리)·지번 본번의 K-apt 단지가 정확히 하나
//   (4. 이름 비교는 publicProvider의 기존 matchKaptComplex가 한다)
import { toRoadNameKey } from './kaptAddress.js';

export const SIBLING_LOT_RANGE = 20;

// 기본은 켬. 'off'·'false'·'0'이면 끈다(이름 비교만 쓰는 이전 방식).
export const isFlagOn = (value) => !['off', 'false', '0'].includes(String(value ?? '').trim().toLowerCase());

// juso 행 → kapt_complexes 도로명 칸과 같은 모양의 키. 도로명·본번이 없으면 null.
export const toJusoRoadKey = (juso) => {
  const roadSigunguCd = String(juso.admCd ?? '').slice(0, 5);
  const roadNameKey = toRoadNameKey(juso.rn);
  const roadMainNo = Number(juso.buldMnnm);
  if (!/^\d{5}$/.test(roadSigunguCd) || !roadNameKey || !Number.isInteger(roadMainNo) || roadMainNo <= 0) {
    return null;
  }
  return {
    roadSigunguCd,
    roadNameKey,
    roadUnderground: String(juso.udrtYn) === '1',
    roadMainNo,
    roadSubNo: Number(juso.buldSlno) || 0,
  };
};

export const toRoadKeyString = (key) =>
  `${key.roadSigunguCd}|${key.roadNameKey}|${key.roadUnderground ? 1 : 0}|${key.roadMainNo}|${key.roadSubNo}`;

// juso 행 → (리 단위 법정동 코드, 지번 본번). 산 번지는 K-apt 번지에 산 여부가 없어서 쓰지 않는다.
export const toJusoLotKey = (juso) => {
  const legalDongCode = String(juso.admCd ?? '');
  const mainLot = Number(juso.lnbrMnnm);
  if (!/^\d{10}$/.test(legalDongCode) || String(juso.mtYn) === '1') return null;
  if (!Number.isInteger(mainLot) || mainLot <= 0) return null;
  return { legalDongCode, mainLot };
};

export const toLotKeyString = (key) => `${key.legalDongCode}|${key.mainLot}`;

const uniqueCodes = (codes) => [...new Set(codes)];

// juso 행마다 연결 결과 { kaptCode, via: 'road'|'sibling'|'lot' } | { ambiguous: true } | null(이름 비교로 넘김)
//   kaptCodesByRoadKey: Map<toRoadKeyString, kaptCode[]>, kaptCodesByLotKey: Map<toLotKeyString, kaptCode[]>
export const linkJusoRowsToKapt = (rows, { kaptCodesByRoadKey, kaptCodesByLotKey }) => {
  const links = rows.map((juso) => {
    const key = toJusoRoadKey(juso);
    const codes = key ? uniqueCodes(kaptCodesByRoadKey.get(toRoadKeyString(key)) ?? []) : [];
    if (codes.length === 1) return { kaptCode: codes[0], via: 'road' };
    if (codes.length > 1) return { ambiguous: true };
    return null;
  });

  // 2. 형제 건물: 도로명으로 연결된 건물과 이름·리 단위 법정동이 같고 본번이 가까우면 같은 단지
  const roadLinked = rows
    .map((juso, index) => ({ juso, link: links[index] }))
    .filter(({ link }) => link?.via === 'road');
  rows.forEach((juso, index) => {
    if (links[index] !== null) return;
    const name = String(juso.bdNm ?? '').trim();
    const mainLot = Number(juso.lnbrMnnm);
    if (!name || !Number.isInteger(mainLot)) return;
    const codes = uniqueCodes(
      roadLinked
        .filter(
          ({ juso: other }) =>
            String(other.bdNm ?? '').trim() === name &&
            other.admCd === juso.admCd &&
            Math.abs(Number(other.lnbrMnnm) - mainLot) <= SIBLING_LOT_RANGE,
        )
        .map(({ link }) => link.kaptCode),
    );
    if (codes.length === 1) links[index] = { kaptCode: codes[0], via: 'sibling' };
    else if (codes.length > 1) links[index] = { ambiguous: true };
  });

  // 3. 법정동(리)+본번: 후보가 정확히 하나일 때만. 둘 이상이면 이름 비교로 넘긴다(같은 번지에 단지가 여럿일 수 있음).
  rows.forEach((juso, index) => {
    if (links[index] !== null) return;
    const key = toJusoLotKey(juso);
    const codes = key ? uniqueCodes(kaptCodesByLotKey.get(toLotKeyString(key)) ?? []) : [];
    if (codes.length === 1) links[index] = { kaptCode: codes[0], via: 'lot' };
  });
  return links;
};

// 검색 결과 항목의 키·complexId를 별칭 소유 단지로 정한다.
//   item.linkedKeys = [KAPT:y, PNU:x](연결된 경우만). ownerByKey: Map<sourceKey, complexId>
//   - KAPT:y가 단지 C의 별칭이면 C (같은 건물의 PNU 별칭이 없거나 C에 있으면 정상)
//   - PNU:x가 C가 아닌 다른 단지 D의 별칭이면 이미 갈라진 쌍 → PNU:x(D) 결과로 둔다(split: true면 로그 대상)
// 결과: { sourceKey, complexId, split }
export const chooseSearchIdentity = (item, ownerByKey) => {
  const kaptKey = item.linkedKeys?.find((key) => key.startsWith('KAPT:'));
  const pnuKey = item.linkedKeys?.find((key) => key.startsWith('PNU:'));
  if (!kaptKey || !pnuKey) {
    return { sourceKey: item.sourceKey, complexId: ownerByKey.get(item.sourceKey) ?? null, split: false };
  }
  const kaptOwner = ownerByKey.get(kaptKey) ?? null;
  const pnuOwner = ownerByKey.get(pnuKey) ?? null;
  if (pnuOwner && pnuOwner !== kaptOwner) {
    return { sourceKey: pnuKey, complexId: pnuOwner, split: kaptOwner !== null };
  }
  return { sourceKey: kaptKey, complexId: kaptOwner, split: false };
};

// 우선순위 순서의 그룹들을 합친다. 같은 sourceKey는 처음 자리에 하나만 두고, 뒤에 오는 주소 검색 항목
// (fromName이 아닌 것)이 있으면 그 자리의 값을 바꿔 둔다(주소가 더 자세함). 그룹 하나를 넣는 중 size에 닿으면 그 그룹은 멈춘다.
export const mergeSearchGroups = (groups, size) => {
  const results = [];
  const indexByKey = new Map();
  for (const group of groups) {
    for (const item of group) {
      const index = indexByKey.get(item.sourceKey);
      if (index !== undefined) {
        if (!item.fromName) results[index] = item;
        continue;
      }
      if (results.length >= size) break;
      indexByKey.set(item.sourceKey, results.length);
      results.push(item);
    }
  }
  return results.slice(0, size);
};
