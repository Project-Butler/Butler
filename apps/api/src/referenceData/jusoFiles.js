// juso 건물DB 파일 읽기: zip(yauzl)·압축 푼 폴더, CP949(MS949) 글자, 줄 경계를 넘는 조각 처리.
// 전체분(build_*.txt, 수백 MB)은 스트림으로 한 줄씩, 변동분(일 zip, 수백 KB)은 버퍼째 읽는다.
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';

// WHATWG 'euc-kr'은 windows-949(CP949) 확장 글자까지 읽는다.
const newDecoder = () => new TextDecoder('euc-kr', { stream: true });

// 바이트 조각(async iterable) → 줄(async generator). 조각 경계에서 잘린 글자·줄을 이어 붙인다. CRLF·LF 모두.
export async function* decodeLines(chunks) {
  const decoder = newDecoder();
  let rest = '';
  for await (const chunk of chunks) {
    rest += decoder.decode(chunk, { stream: true });
    const lines = rest.split('\n');
    rest = lines.pop();
    for (const line of lines) yield line.endsWith('\r') ? line.slice(0, -1) : line;
  }
  rest += decoder.decode();
  if (rest.length > 0) yield rest.endsWith('\r') ? rest.slice(0, -1) : rest;
}

// 버퍼 한 덩어리를 CP949로 읽는다.
export const decodeCp949 = (buffer) => new TextDecoder('euc-kr').decode(buffer);

const openZipFile = (zipPath) =>
  new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (error, zipfile) => (error ? reject(error) : resolve(zipfile)));
  });

const openZipBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => (error ? reject(error) : resolve(zipfile)));
  });

const listEntries = (zipfile) =>
  new Promise((resolve, reject) => {
    const entries = [];
    zipfile.on('entry', (entry) => {
      entries.push(entry);
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(entries));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });

const openEntryStream = (zipfile, entry) =>
  new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream)));
  });

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

// 변동분 zip 버퍼 → { [파일 이름]: Buffer }
export const readZipBuffer = async (buffer) => {
  const zipfile = await openZipBuffer(buffer);
  const entries = await listEntries(zipfile);
  const files = {};
  for (const entry of entries) {
    if (entry.fileName.endsWith('/')) continue;
    files[entry.fileName] = await streamToBuffer(await openEntryStream(zipfile, entry));
  }
  return files;
};

const BUILDING_FILE_PATTERN = /(^|\/)build_[a-z]+\.txt$/;

// 전체분 출처(zip 경로 또는 폴더) → 건물 파일 목록 [{ name, size, open() → 바이트 스트림 }]과 close().
// 기준일 안내 파일('…(2026년 09월 30일 기준).txt' 같은 작은 txt)의 글자도 돌려준다(fileDate 추정용).
export const openFullSource = async (sourcePath) => {
  const info = await stat(sourcePath);
  if (info.isDirectory()) {
    const names = (await readdir(sourcePath)).sort();
    const buildFiles = [];
    let notice = null;
    for (const name of names) {
      const full = path.join(sourcePath, name);
      if (BUILDING_FILE_PATTERN.test(name)) {
        buildFiles.push({ name, size: (await stat(full)).size, open: () => createReadStream(full) });
      } else if (/\.txt$/i.test(name) && !/^(jibun_|road_code)/.test(name) && (await stat(full)).size < 20000) {
        notice = decodeCp949(await streamToBuffer(createReadStream(full)));
      }
    }
    return { buildFiles, notice, close: () => {} };
  }

  const zipfile = await openZipFile(sourcePath);
  const entries = await listEntries(zipfile);
  const buildFiles = entries
    .filter((entry) => BUILDING_FILE_PATTERN.test(entry.fileName))
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .map((entry) => ({ name: entry.fileName, size: entry.uncompressedSize, open: () => openEntryStream(zipfile, entry) }));
  let notice = null;
  const noticeEntry = entries.find(
    (entry) => /\.txt$/i.test(entry.fileName) && !/(build_|jibun_|road_code)/.test(entry.fileName) && entry.uncompressedSize < 20000,
  );
  if (noticeEntry) notice = decodeCp949(await streamToBuffer(await openEntryStream(zipfile, noticeEntry)));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    zipfile.close();
  };
  return { buildFiles, notice, close };
};

// 안내 파일 '2026년 09월 30일 기준' 또는 zip 이름 '202609_건물DB_전체분.zip'(그 달 말일) → 'YYYY-MM-DD'. 못 찾으면 null.
export const inferFullFileDate = (notice, sourcePath) => {
  const fromNotice = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*기준/.exec(notice ?? '');
  if (fromNotice) {
    return `${fromNotice[1]}-${fromNotice[2].padStart(2, '0')}-${fromNotice[3].padStart(2, '0')}`;
  }
  const fromName = /(?:^|[\\/])(\d{4})(\d{2})_[^\\/]*$/.exec(sourcePath ?? '');
  if (fromName) {
    const lastDay = new Date(Date.UTC(Number(fromName[1]), Number(fromName[2]), 0));
    return lastDay.toISOString().slice(0, 10);
  }
  return null;
};
