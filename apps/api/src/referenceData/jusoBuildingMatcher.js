// juso 건물DB 줄(전체분 build_*.txt·변동분 TI_SPBD_BULD 공통, 31칸) → K-apt 단지 연결.
// 순수 함수만 둔다(DB·외부 호출 없음). 전체분 적재·변동분 적용(CLI·cron)이 같은 matchBuilding을 쓴다.
//
// 연결 규칙(건물 한 줄만 보고 정한다 — 다른 건물의 결과에 기대지 않아서 전체분과 변동분의 결과가 같다):
//   ROAD_KEY     공동주택 건물의 도로명 키가 K-apt 쪽 도로명주소(kapt_address_links)와 같음
//   LOT          공동주택 건물의 필지(건물관리번호 앞 19자리 = PNU) 또는 대표 지번이 K-apt 법정동+번지와 같음
//   NON_APT_FLAG 공동주택 표시가 없는 건물의 도로명 키가 K-apt 쪽 도로명주소와 같음
// 후보가 여럿이면 분양·혼합 > 임대 > 그 밖, 같으면 kaptCode 오름차순 하나(kaptLinks.pickBestKapt).
import { toRoadNameKey } from '../domains/complexes/kaptAddress.js';
import { pickBestKapt } from '../domains/complexes/kaptLinks.js';
import { parsePnu } from '../domains/complexes/provider/pnu.js';

export const BUILDING_COLUMN_COUNT = 31;

const LEGAL_DONG_CODE_PATTERN = /^\d{10}$/;
const BUILDING_MGT_NO_PATTERN = /^\d{25}$/;
const NUMBER_PATTERN = /^\d{1,5}$/;

const toInt = (value) => (NUMBER_PATTERN.test(value) ? Number(value) : null);
const trimOrNull = (value) => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};

// 지하여부: 0 지상, 1 지하, 2 공중, 3 수상. juso 검색(udrtYn)과 단지 키는 0/1만 쓰므로 그 밖은 null(연결 안 함).
const toUnderground = (value) => {
  if (value === '0') return false;
  if (value === '1') return true;
  return null;
};

// 한 줄('|' 구분, 끝 줄바꿈 없음) → 건물 행. 칸 수가 31이 아니거나 키 칸이 틀리면 null(파싱 실패).
export const parseBuildingLine = (line) => {
  const fields = line.split('|');
  if (fields.length !== BUILDING_COLUMN_COUNT) return null;
  const legalDongCode = fields[0];
  const buildingMgtNo = fields[15];
  const mainNo = toInt(fields[11]);
  const subNo = toInt(fields[12] || '0');
  if (!LEGAL_DONG_CODE_PATTERN.test(legalDongCode) || !BUILDING_MGT_NO_PATTERN.test(buildingMgtNo)) return null;
  if (mainNo === null || subNo === null) return null;

  return {
    buildingMgtNo,
    legalDongCode,
    sidoName: trimOrNull(fields[1]),
    sigunguName: trimOrNull(fields[2]),
    eupmyeondongName: trimOrNull(fields[3]),
    isMountain: fields[5] === '1',
    lotMainNo: toInt(fields[6]),
    lotSubNo: toInt(fields[7] || '0'),
    roadCode: trimOrNull(fields[8]),
    roadName: trimOrNull(fields[9]),
    underground: toUnderground(fields[10]),
    mainNo,
    subNo,
    changeReasonCode: trimOrNull(fields[22]),
    isApartment: fields[26] === '1',
  };
};

// 건물 행 → 텍스트 도로명 키(kapt_address_links·complexes와 같은 모양). 도로명이 없거나 지하여부가 0/1이 아니면 null.
// 시군구는 법정동 코드 앞 5자리(juso 검색 admCd·K-apt bjdCode와 같은 방식).
export const toBuildingRoadKey = (row) => {
  const roadNameKey = toRoadNameKey(row.roadName);
  if (!roadNameKey || row.underground === null) return null;
  return {
    sigunguCd: row.legalDongCode.slice(0, 5),
    roadNameKey,
    underground: row.underground,
    mainNo: row.mainNo,
    subNo: row.subNo,
  };
};

export const roadKeyId = (key) => `${key.sigunguCd}|${key.roadNameKey}|${key.underground ? 1 : 0}|${key.mainNo}|${key.subNo}`;
export const lotKeyId = (legalDongCode, mainLot, subLot) => `${legalDongCode}|${mainLot}|${subLot}`;

// 건물의 필지 키 목록: 건물관리번호 앞 19자리(PNU, 산 제외)와 대표 지번(6~8번 칸, 산 제외).
export const toBuildingLotKeyIds = (row) => {
  const ids = new Set();
  const pnu = parsePnu(row.buildingMgtNo.slice(0, 19));
  if (pnu && pnu.mtYn === '0') ids.add(lotKeyId(pnu.admCd, Number(pnu.mainNo), Number(pnu.subNo)));
  if (!row.isMountain && row.lotMainNo !== null && row.lotSubNo !== null) {
    ids.add(lotKeyId(row.legalDongCode, row.lotMainNo, row.lotSubNo));
  }
  return [...ids];
};

// K-apt 쪽 조회 묶음. roadLinks: [{ roadSigunguCd, roadNameKey, roadUnderground, roadMainNo, roadSubNo, kaptCode, saleType }]
// (kapt_address_links ⨝ 활성 kapt_complexes), lots: [{ legalDongCode, mainLot, subLot, kaptCode, saleType }].
// 결과 lookup.road(id)·lookup.lot(id)는 후보 배열([{ kaptCode, saleType }], 없으면 []).
export const buildKaptLookup = ({ roadLinks, lots }) => {
  const road = new Map();
  const lot = new Map();
  const add = (map, id, candidate) => {
    const list = map.get(id) ?? [];
    if (!list.some((item) => item.kaptCode === candidate.kaptCode)) list.push(candidate);
    map.set(id, list);
  };
  for (const link of roadLinks) {
    const id = roadKeyId({
      sigunguCd: link.roadSigunguCd,
      roadNameKey: link.roadNameKey,
      underground: link.roadUnderground,
      mainNo: link.roadMainNo,
      subNo: link.roadSubNo,
    });
    add(road, id, { kaptCode: link.kaptCode, saleType: link.saleType ?? null });
  }
  for (const item of lots) {
    add(lot, lotKeyId(item.legalDongCode, item.mainLot, item.subLot), {
      kaptCode: item.kaptCode,
      saleType: item.saleType ?? null,
    });
  }
  return {
    road: (id) => road.get(id) ?? [],
    lot: (id) => lot.get(id) ?? [],
    size: { roadKeys: road.size, lotKeys: lot.size },
  };
};

// 건물 행 → juso_building_links 행 또는 null(연결 안 됨).
export const matchBuilding = (row, lookup) => {
  const key = toBuildingRoadKey(row);
  if (!key) return null;

  const roadCandidates = lookup.road(roadKeyId(key));
  let matchRule = null;
  let candidates = [];
  if (row.isApartment && roadCandidates.length > 0) {
    matchRule = 'ROAD_KEY';
    candidates = roadCandidates;
  } else if (row.isApartment) {
    candidates = toBuildingLotKeyIds(row).flatMap((id) => lookup.lot(id));
    if (candidates.length > 0) matchRule = 'LOT';
  } else if (roadCandidates.length > 0) {
    matchRule = 'NON_APT_FLAG';
    candidates = roadCandidates;
  }
  if (!matchRule) return null;

  return {
    buildingMgtNo: row.buildingMgtNo,
    roadSigunguCd: key.sigunguCd,
    roadNameKey: key.roadNameKey,
    roadUnderground: key.underground,
    roadMainNo: key.mainNo,
    roadSubNo: key.subNo,
    roadCode: row.roadCode,
    kaptCode: pickBestKapt(candidates).kaptCode,
    matchRule,
  };
};

// 단지 주소 칸에 쓸 도로명주소 글자: '서울특별시 노원구 동일로207길 17', 읍·면이면 '경기도 가평군 가평읍 가화로 142-26'.
export const toRoadAddressText = (row) => {
  const eupmyeon = /[읍면]$/.test(row.eupmyeondongName ?? '') ? row.eupmyeondongName : null;
  const number = `${row.underground ? '지하 ' : ''}${row.mainNo}${row.subNo ? `-${row.subNo}` : ''}`;
  return [row.sidoName, row.sigunguName, eupmyeon, row.roadName, number].filter(Boolean).join(' ');
};
