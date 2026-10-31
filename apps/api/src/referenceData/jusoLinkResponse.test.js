import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { splitDeltaLines } from './jusoDeltaApplier.js';
import {
  classifyLinkResCode,
  compositeLinkHash,
  downloadJusoLink,
  evaluateLinkDay,
  groupLinkFilesByDate,
  LINK_CODES,
  parseLinkResponse,
  readLinkZipTables,
  toLinkRequestUrl,
} from './jusoLinkResponse.js';

// 2026-10-26 공식 연계 실제 응답(키 없음 — 응답 본문에는 승인키가 들어 있지 않다)
const fixture = (code) => readFileSync(new URL(`./fixtures/juso-link-${code}-20261026.bin`, import.meta.url));

// 머리 100바이트 만들기(테스트용)
const header = ({ seq = '01', date = '20261023', name = 'AlterD.JUSUDG.20261023.ZIP', size, res = 'P0000', code = '100004', retry = 'N' }) =>
  Buffer.from(
    `${seq}${date}${name.padEnd(50, ' ')}${String(size).padStart(10, '0')}${res}${code}${retry}${date}${' '.repeat(10)}`,
    'latin1',
  );

test('실제 응답 3종: 머리 100바이트 + zip 하나, 응답코드 P0000, 크기 일치', () => {
  for (const code of Object.values(LINK_CODES)) {
    const body = fixture(code);
    const files = parseLinkResponse(body);
    assert.equal(files.length, 1);
    const [file] = files;
    assert.equal(file.cntcCode, code);
    assert.equal(file.fileDate, '2026-10-26');
    assert.equal(file.resCode, 'P0000');
    assert.equal(file.retry, false);
    assert.equal(file.size + 100, body.length);
    assert.equal(file.zip.subarray(0, 2).toString('latin1'), 'PK');
  }
});

test('zip 안 테이블: 동표시 11칸, 도로명주소 24칸·관련지번 14칸, 변동 없는 도로명은 No Data → 줄 0개', async () => {
  const dong = await readLinkZipTables(parseLinkResponse(fixture('100004'))[0].zip);
  const dongLines = splitDeltaLines(dong.TH_RNSPBD_DONG);
  assert.ok(dongLines.length > 0);
  assert.ok(dongLines.every((line) => line.split('|').length === 11));
  assert.ok(dongLines.some((line) => line.includes('조양휴캐슬')));

  const road = await readLinkZipTables(parseLinkResponse(fixture('100001'))[0].zip);
  assert.ok(splitDeltaLines(road.TH_SGCO_RNADR_MST).every((line) => line.split('|').length === 24));
  assert.ok(splitDeltaLines(road.TH_SGCO_RNADR_LNBR).every((line) => line.split('|').length === 14));

  const roadName = await readLinkZipTables(parseLinkResponse(fixture('100005'))[0].zip);
  assert.deepEqual(splitDeltaLines(roadName.TI_SPRD_RDNM), []);
});

test('여러 파일이 이어 붙은 응답(재반영 포함)과 크기 0·오류 응답코드', () => {
  const zip = fixture('100004').subarray(100);
  const body = Buffer.concat([
    header({ size: zip.length }),
    zip,
    header({ seq: '02', date: '20261024', name: 'AlterD.JUSUDG.20261024.ZIP', size: 0, res: 'E1001' }),
    header({ seq: '03', size: zip.length, retry: 'Y' }),
    zip,
  ]);
  const files = parseLinkResponse(body);
  assert.deepEqual(
    files.map((file) => [file.seq, file.fileDate, file.resCode, file.retry, Boolean(file.zip)]),
    [
      ['01', '2026-10-23', 'P0000', false, true],
      ['02', '2026-10-24', 'E1001', false, false],
      ['03', '2026-10-23', 'P0000', true, true],
    ],
  );
});

test('잘린 응답·zip이 아닌 본문은 형식 오류', () => {
  assert.throws(() => parseLinkResponse(Buffer.from('0120261023')), { reason: 'format changed: truncated header' });
  const notZip = Buffer.from('<xml/>');
  assert.throws(() => parseLinkResponse(Buffer.concat([header({ size: notZip.length }), notZip])), {
    reason: 'format changed: file is not zip',
  });
  assert.throws(() => parseLinkResponse(Buffer.concat([header({ size: 999 }), notZip])), {
    reason: 'format changed: truncated file',
  });
});

test('응답코드 분류', () => {
  assert.equal(classifyLinkResCode('P0000'), 'ok');
  assert.equal(classifyLinkResCode('P1000'), 'ok');
  assert.equal(classifyLinkResCode('E1001'), 'notYet');
  assert.equal(classifyLinkResCode('E0003'), 'keyError');
  assert.equal(classifyLinkResCode('E1999'), 'error');
});

test('날짜별 묶기와 완결성: 세 구분 모두 있어야 complete, 키 오류는 failed', () => {
  const ok = (date, retry = false) => ({ fileDate: date, resCode: 'P0000', seq: retry ? '02' : '01', retry, zip: Buffer.from('PK') });
  const byDate = groupLinkFilesByDate({
    100001: [ok('2026-10-23'), ok('2026-10-24')],
    100004: [ok('2026-10-23', true), ok('2026-10-23'), ok('2026-10-24')],
    100005: [ok('2026-10-23'), { fileDate: '2026-10-24', resCode: 'E1001', seq: '01', retry: false, zip: null }],
  });
  assert.deepEqual([...byDate.keys()].sort(), ['2026-10-23', '2026-10-24']);
  assert.deepEqual(byDate.get('2026-10-23')['100004'].map((file) => file.retry), [false, true]);
  assert.deepEqual(evaluateLinkDay(byDate.get('2026-10-23')), { status: 'complete' });
  assert.deepEqual(evaluateLinkDay(byDate.get('2026-10-24')), { status: 'waiting', missing: ['100005'] });
  assert.deepEqual(evaluateLinkDay({ 100001: [{ resCode: 'E0003', zip: null }] }), { status: 'failed', reason: '100001 E0003' });
  assert.deepEqual(evaluateLinkDay(undefined), { status: 'waiting', missing: ['100001', '100004', '100005'] });
});

test('합성 해시: 같은 파일들이면 같고, 하나라도 바뀌면 다르다(40자)', () => {
  const a = compositeLinkHash([Buffer.from('a'), Buffer.from('b'), null]);
  assert.equal(a.length, 40);
  assert.equal(a, compositeLinkHash([Buffer.from('a'), Buffer.from('b'), null]));
  assert.notEqual(a, compositeLinkHash([Buffer.from('a'), Buffer.from('c'), null]));
  assert.notEqual(a, compositeLinkHash([Buffer.from('ab'), Buffer.alloc(0), null]));
});

test('요청 주소와 받기 오류에는 키·주소가 들어가지 않는다', async () => {
  const url = new URL(toLinkRequestUrl({ appKey: 'SECRET', cntcCode: '100004', from: '2026-10-20', to: '2026-10-23' }));
  assert.equal(url.searchParams.get('req_dt'), '20261020');
  assert.equal(url.searchParams.get('req_dt2'), '20261023');
  assert.equal(url.searchParams.get('retry_in'), 'Y');
  assert.equal(url.searchParams.get('date_gb'), 'D');

  const failing = async () => ({ ok: false, status: 503 });
  await assert.rejects(downloadJusoLink({ appKey: 'SECRET', cntcCode: '100004', from: '2026-10-23', fetchImpl: failing }), (error) => {
    assert.equal(error.reason, '100004 HTTP 503');
    assert.doesNotMatch(`${error.message} ${error.reason}`, /SECRET|update\.juso/);
    return true;
  });
  const throwing = async () => {
    throw new TypeError('fetch failed http://update.juso.go.kr/updateInfo.do?app_key=SECRET');
  };
  await assert.rejects(downloadJusoLink({ appKey: 'SECRET', cntcCode: '100001', from: '2026-10-23', fetchImpl: throwing }), {
    reason: '100001 network error',
  });

  const body = fixture('100004');
  const okFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => body });
  const files = await downloadJusoLink({ appKey: 'k', cntcCode: '100004', from: '2026-10-26', fetchImpl: okFetch });
  assert.equal(files[0].fileName, 'AlterD.JUSUDG.20261026.ZIP');
});
