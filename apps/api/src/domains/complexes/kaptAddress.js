// K-apt 기본정보 주소 문자열 파싱(순수 함수, DB·외부 호출 없음).
// doroJuso(도로명주소)·kaptAddr(지번주소)는 자유 문자열이라, juso 결과와 비교할 수 있게 구조 키로 바꾼다.
//   '서울특별시 송파구 올림픽로 435' → { sigunguCd: '11710', roadNameKey: '올림픽로', underground: false, mainNo: 435, subNo: 0 }
//   '서울특별시 송파구 신천동 17 잠실파크리오' → { mainLot: 17, subLot: 0, isMountain: false }

const LEGAL_DONG_CODE_PATTERN = /^\d{10}$/;
// 도로명: '올림픽로', '희망로17길', '동일로522번길', '해밀2로'
const ROAD_NAME_PATTERN = /^[0-9A-Za-z가-힣.·]+(?:로|길)$/;
const BUILDING_NO_PATTERN = /^(\d{1,5})(?:-(\d{1,5}))?(?:번지)?,?$/;
// 도로명과 건물번호가 붙어 온 토큰: '고원로167', '영주로299'
const GLUED_ROAD_PATTERN = /^([0-9A-Za-z가-힣.·]*[가-힣](?:로|길))(\d{1,5}(?:-\d{1,5})?(?:번지)?,?)$/;
// 시도·시군구·읍면 토큰(도로명 앞에 올 수 있는 지역명)
const REGION_TOKEN_PATTERN = /(?:시|도|군|구|읍|면)$/;
const MAX_REGION_TOKENS = 4;

const toTokens = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .replace(/\([^)]*\)/g, ' ') // '(신천동)' 같은 참고항목
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

// doroJuso → 도로명 구조 키. 시군구 코드는 주소 글자 대신 K-apt 법정동 코드 앞 5자리를 쓴다
// (세종특별자치시처럼 시군구가 없는 주소도 같은 방식). 형식이 맞지 않으면 null.
// 붙은 토큰을 도로명·건물번호 두 토큰으로 나눈다('동일로522번길'처럼 그 자체로 도로명이면 두지 않는다).
const splitGluedRoad = (tokens) =>
  tokens.flatMap((token) => {
    if (ROAD_NAME_PATTERN.test(token)) return [token];
    const match = GLUED_ROAD_PATTERN.exec(token);
    return match ? [match[1], match[2]] : [token];
  });

export const parseRoadAddress = (doroJuso, legalDongCode) => {
  const tokens = splitGluedRoad(toTokens(doroJuso));
  if (tokens.length < 3) return null;

  // 맨 앞은 시도(전체 '강원특별자치도'·줄임 '강원') 또는 시도가 빠진 주소의 시군구('영주시')라 건너뛴다.
  // 그 뒤 도로명이 나오기 전까지는 지역명(시군구·구·읍면)만 허용한다. 건물번호 뒤 토큰(단지명 등)은 보지 않는다.
  let index = 1;
  while (index < tokens.length && !ROAD_NAME_PATTERN.test(tokens[index])) {
    if (!REGION_TOKEN_PATTERN.test(tokens[index]) || index > MAX_REGION_TOKENS) return null;
    index += 1;
  }
  const roadName = tokens[index];
  if (!roadName) return null;

  let next = index + 1;
  const underground = tokens[next] === '지하';
  if (underground) next += 1;

  const match = BUILDING_NO_PATTERN.exec(tokens[next] ?? '');
  if (!match) return null;

  const code = String(legalDongCode ?? '');
  return {
    sigunguCd: LEGAL_DONG_CODE_PATTERN.test(code) ? code.slice(0, 5) : null,
    roadNameKey: roadName,
    underground,
    mainNo: Number(match[1]),
    subNo: match[2] ? Number(match[2]) : 0,
  };
};

// 정규화된 도로명 키(juso rn 필드와 비교할 때 같은 함수를 쓴다)
export const toRoadNameKey = (roadName) => String(roadName ?? '').normalize('NFKC').replace(/\s+/g, '');

// kaptAddr → 번지. 지역명 뒤 첫 번지('17', '419-18', '산12-3', '665-')를 읽는다. 없으면 null.
const LOT_PATTERN = /\s(산\s?)?(\d{1,4})(?:-(\d{1,4})?)?(?:번지)?(?=\s|$)/;

export const parseJibunLot = (kaptAddr) => {
  const text = toTokens(kaptAddr).join(' ');
  const match = LOT_PATTERN.exec(text);
  if (!match) return null;
  return {
    mainLot: Number(match[2]),
    subLot: match[3] ? Number(match[3]) : 0,
    isMountain: Boolean(match[1]),
  };
};

// kaptAddr(엑셀 법정동주소) → 번지 목록. 엑셀은 필지가 여럿이면 쉼표로 잇는다
//   '서울특별시 노원구 중계동 504-1,서울특별시 노원구 중계동 503 중계그린' → [504-1, 503]
// 산 번지는 juso 건물DB 번지 키와 섞이지 않게 뺀다. 같은 번지는 한 번만.
export const parseJibunLots = (kaptAddr) => {
  const lots = [];
  const seen = new Set();
  for (const part of String(kaptAddr ?? '').split(',')) {
    const lot = parseJibunLot(` ${part.trim()}`);
    if (!lot || lot.isMountain) continue;
    const id = `${lot.mainLot}-${lot.subLot}`;
    if (seen.has(id)) continue;
    seen.add(id);
    lots.push({ mainLot: lot.mainLot, subLot: lot.subLot });
  }
  return lots;
};
