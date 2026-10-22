import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { addDays, extractDeltaBuildingText, toDeltaDownloadUrl } from './jusoDelta.js';
import { splitDeltaLines } from './jusoDeltaApplier.js';
import { decodeLines, inferFullFileDate } from './jusoFiles.js';
import { parseBuildingLine } from './jusoBuildingMatcher.js';

async function* chunksOf(buffer, size) {
  for (let index = 0; index < buffer.length; index += size) yield buffer.subarray(index, index + size);
}

const collect = async (iterable) => {
  const lines = [];
  for await (const line of iterable) lines.push(line);
  return lines;
};

// '중계|섬밭로\r\n노원' (CP949): 중 C1DF, 계 B0E8, 섬 BCB6, 밭 B9E7, 로 B7CE, 노 B3EB, 원 BFF8
const CP949 = Buffer.from('c1dfb0e87cbcb6b9e7b7ce0d0ab3ebbff8', 'hex');

test('CP949 줄 읽기: 조각 경계가 글자·줄 가운데여도 이어 붙인다', async () => {
  for (const size of [1, 2, 3, 5, 100]) {
    assert.deepEqual(await collect(decodeLines(chunksOf(CP949, size))), ['중계|섬밭로', '노원']);
  }
});

test('변동분 zip → TI_SPBD_BULD 글자(CP949), 31칸 줄', async () => {
  const text = await extractDeltaBuildingText(readFileSync(new URL('./fixtures/juso-delta-sample.zip', import.meta.url)));
  const lines = splitDeltaLines(text);
  assert.equal(lines.length, 3);
  const row = parseBuildingLine(lines[0]);
  assert.equal(row.sigunguName, '종로구');
  assert.equal(row.roadName, '세종대로');
  assert.equal(row.changeReasonCode, '34');
});

test('변동 없는 날 zip(실제 20260919 파일) → 줄 0개', async () => {
  const text = await extractDeltaBuildingText(readFileSync(new URL('./fixtures/juso-delta-nodata.zip', import.meta.url)));
  assert.deepEqual(splitDeltaLines(text), []);
});

test('전체분 기준일: 안내 파일 문구, 없으면 zip 이름의 그 달 말일', () => {
  assert.equal(inferFullFileDate('2026년 09월 30일 기준 건물DB(구 전체주소) 데이터를', 'x.zip'), '2026-09-30');
  assert.equal(inferFullFileDate(null, 'C:/data/202602_건물DB_전체분.zip'), '2026-02-28');
  assert.equal(inferFullFileDate(null, 'build'), null);
});

test('받기 주소와 날짜 계산', () => {
  const url = new URL(toDeltaDownloadUrl('2026-10-19'));
  assert.equal(url.searchParams.get('stdde'), '20261019');
  assert.equal(url.searchParams.get('regYmd'), '2026');
  assert.equal(url.searchParams.get('fileName'), '20261019_dailynoticedata.zip');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-01-01', -2), '2025-12-30');
});
