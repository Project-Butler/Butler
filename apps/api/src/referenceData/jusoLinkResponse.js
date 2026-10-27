// 도로명주소 변동자료 공식 연계(update.juso.go.kr/updateInfo.do) 응답 받기·해석.
// 응답 본문은 XML·JSON이 아니라 "파일 머리 100바이트 + zip 바이트"가 파일 수만큼 이어 붙은 바이너리다(Content-Type 없음).
//   머리: 순번 2 | 기준일 8 | 파일명 50 | 크기 10 | 응답코드 5 | 자료요청 구분 6 | 재반영 여부 1 | 생성일 8 | 여분 10
// zip 안은 CP949 '|' 구분 TXT(이름 AlterD.<문서코드>.<YYYYMMDD>.<테이블명>.TXT). 변동 없는 날은 'No Data' 한 줄이다.
// 승인키는 URL 쿼리에만 들어간다 — URL·키를 로그·에러·기록에 남기지 않는다.
import { createHash } from 'node:crypto';
import { decodeCp949, readZipBuffer } from './jusoFiles.js';

// 가이드 예시는 http지만 https도 같은 응답을 준다(2026-10-27 확인) — 승인키가 평문으로 다니지 않게 https를 쓴다.
export const LINK_UPDATE_URL = 'https://update.juso.go.kr/updateInfo.do';
export const LINK_DOWNLOAD_TIMEOUT_MS = 10_000;
// 한 번 요청에 받을 수 있는 최대 기간(가이드 E1004). 처리량이 아니라 API 한도다.
export const LINK_MAX_RANGE_DAYS = 10;

// 자료요청 구분(cntc_cd) — 가이드 "자료요청 구분 목록"
export const LINK_CODES = {
  ROAD_ADDRESS: '100001', // 도로명주소 한글(TH_SGCO_RNADR_MST·TH_SGCO_RNADR_LNBR)
  BUILDING_DONG: '100004', // 상세주소 동 표시(TH_RNSPBD_DONG)
  ROAD_NAME: '100005', // 도로명(TI_SPRD_RDNM)
};

const HEADER_BYTES = 100;
const ZIP_SIGNATURE = Buffer.from('PK\x03\x04', 'latin1');

// 응답코드 → 분류. ok: 파일 있음, notYet: 아직 안 만들어짐(다음에 다시), keyError: 승인키 문제, error: 그 밖
export const classifyLinkResCode = (resCode) => {
  if (resCode === 'P0000' || resCode === 'P1000') return 'ok';
  if (resCode === 'E1001') return 'notYet';
  if (/^E000[1-4]$/.test(resCode)) return 'keyError';
  return 'error';
};

const toYmd = (yyyymmdd) => (/^\d{8}$/.test(yyyymmdd) ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` : null);
const ascii = (buffer) => buffer.toString('latin1');

// 머리 100바이트 → 칸
export const parseLinkHeader = (header) => {
  const size = Number(ascii(header.subarray(60, 70)).trim());
  return {
    seq: ascii(header.subarray(0, 2)).trim(),
    fileDate: toYmd(ascii(header.subarray(2, 10))),
    fileName: ascii(header.subarray(10, 60)).trim(),
    size: Number.isInteger(size) && size >= 0 ? size : null,
    resCode: ascii(header.subarray(70, 75)).trim(),
    cntcCode: ascii(header.subarray(75, 81)).trim(),
    retry: ascii(header.subarray(81, 82)) === 'Y',
    makeDate: toYmd(ascii(header.subarray(82, 90))),
  };
};

// 응답 본문 → [{ ...머리, zip(Buffer|null) }]. 형식이 틀리면 reason이 붙은 에러를 던진다.
// 크기가 0이거나 응답코드가 정상이 아니면 zip은 null이다.
export const parseLinkResponse = (body) => {
  const files = [];
  let offset = 0;
  while (offset < body.length) {
    if (body.length - offset < HEADER_BYTES) {
      throw Object.assign(new Error('link response truncated'), { reason: 'format changed: truncated header' });
    }
    const header = parseLinkHeader(body.subarray(offset, offset + HEADER_BYTES));
    if (header.size === null) throw Object.assign(new Error('bad size'), { reason: 'format changed: bad file size' });
    const start = offset + HEADER_BYTES;
    const end = start + header.size;
    if (end > body.length) throw Object.assign(new Error('link response truncated'), { reason: 'format changed: truncated file' });
    const data = body.subarray(start, end);
    const isZip = data.length >= 4 && data.subarray(0, 4).equals(ZIP_SIGNATURE);
    if (header.size > 0 && classifyLinkResCode(header.resCode) === 'ok' && !isZip) {
      throw Object.assign(new Error('not a zip'), { reason: 'format changed: file is not zip' });
    }
    files.push({ ...header, zip: isZip ? Buffer.from(data) : null });
    offset = end;
  }
  return files;
};

// zip → { [테이블명]: 글자 } (예: TH_RNSPBD_DONG). 이름 규칙을 벗어난 항목은 파일 이름 그대로.
export const readLinkZipTables = async (zip) => {
  const entries = await readZipBuffer(zip);
  const tables = {};
  for (const [name, buffer] of Object.entries(entries)) {
    const match = /(?:^|\/)AlterD\.[A-Z]+\.\d{8}\.([A-Z_]+)\.TXT$/i.exec(name);
    tables[match ? match[1].toUpperCase() : name] = decodeCp949(buffer);
  }
  return tables;
};

// 날짜 하나를 이루는 파일들(세 자료요청 구분)의 크기·SHA-1을 이어 붙인 합성 해시(PARTIAL 이어 하기 식별용).
export const compositeLinkHash = (zips) => {
  const hash = createHash('sha1');
  for (const zip of zips) {
    const part = zip ?? Buffer.alloc(0);
    hash.update(`${part.length}:`);
    hash.update(createHash('sha1').update(part).digest('hex'));
    hash.update(';');
  }
  return hash.digest('hex');
};

const compact = (ymd) => ymd.replaceAll('-', '');

// 요청 URL(키 포함 — 밖으로 내보내지 않는다). from·to: 'YYYY-MM-DD', 최대 10일.
export const toLinkRequestUrl = ({ appKey, cntcCode, from, to, retry = true }) => {
  const params = new URLSearchParams({
    app_key: appKey,
    date_gb: 'D',
    cntc_cd: cntcCode,
    retry_in: retry ? 'Y' : 'N',
    req_dt: compact(from),
    req_dt2: compact(to ?? from),
  });
  return `${LINK_UPDATE_URL}?${params}`;
};

// 한 자료요청 구분의 기간 자료 받기 → parseLinkResponse 결과. HTTP·네트워크 오류는 reason만 붙여 던진다(URL 없음).
export const downloadJusoLink = async ({
  appKey,
  cntcCode,
  from,
  to,
  fetchImpl = fetch,
  timeoutMs = LINK_DOWNLOAD_TIMEOUT_MS,
}) => {
  let response;
  try {
    response = await fetchImpl(toLinkRequestUrl({ appKey, cntcCode, from, to }), { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network error';
    throw Object.assign(new Error('juso link download failed'), { reason: `${cntcCode} ${reason}` });
  }
  if (!response.ok) throw Object.assign(new Error('juso link download failed'), { reason: `${cntcCode} HTTP ${response.status}` });
  return parseLinkResponse(Buffer.from(await response.arrayBuffer()));
};

// 세 자료요청 구분의 파일 목록 → 날짜별 묶음 Map('YYYY-MM-DD' → { [cntcCode]: [파일…] }). 재반영 파일은 같은 날짜 뒤에 붙는다.
export const groupLinkFilesByDate = (filesByCode) => {
  const byDate = new Map();
  for (const [cntcCode, files] of Object.entries(filesByCode)) {
    for (const file of files) {
      if (!file.fileDate) continue;
      const day = byDate.get(file.fileDate) ?? {};
      (day[cntcCode] ??= []).push(file);
      byDate.set(file.fileDate, day);
    }
  }
  for (const day of byDate.values()) {
    for (const list of Object.values(day)) list.sort((a, b) => Number(a.retry) - Number(b.retry) || a.seq.localeCompare(b.seq));
  }
  return byDate;
};

// 날짜 하나가 적용 가능한지: 세 구분 모두 정상 파일(zip)이 있어야 complete.
// 하나라도 keyError/error면 failed, 아니면(아직 없음) waiting.
export const evaluateLinkDay = (day, codes = Object.values(LINK_CODES)) => {
  const missing = [];
  for (const code of codes) {
    const files = day?.[code] ?? [];
    const bad = files.find((file) => ['keyError', 'error'].includes(classifyLinkResCode(file.resCode)));
    if (bad) return { status: 'failed', reason: `${code} ${bad.resCode}` };
    if (!files.some((file) => file.zip)) missing.push(code);
  }
  return missing.length === 0 ? { status: 'complete' } : { status: 'waiting', missing };
};
