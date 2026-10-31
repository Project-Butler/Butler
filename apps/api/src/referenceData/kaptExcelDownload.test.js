import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { downloadLatestKaptExcel, findLatestPost } from './kaptExcelDownload.js';

const postHtml = (seq, date) => `<a href="#" class="headLine" onclick="javascript:goCheck(${seq}, 0);">\n K-apt 관리비공개의무단지 기본정보(${date})\n</a>`;
const LIST_HTML = `<meta name="_csrf" content="token-1"/>`;
const AJAX_HTML = postHtml(136011, '2026.10.23.') + postHtml(136128, '2026.10.30.');
const WORKBOOK = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.alloc(5_000_000)]);

const toResponse = (body, { status = 200, cookie } = {}) => new Response(body, { status, headers: cookie ? { 'Set-Cookie': cookie } : {} });

// 파일 목록 등록은 쿠키·CSRF 헤더·JSON 본문이 맞아야 200(실제 사이트와 같은 조건)
const createFakeSite = ({ workbook = WORKBOOK, files = [{ seq: 1, fileName: '20261030_단지_기본정보.xlsx' }] } = {}) => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const { pathname } = new URL(url);
    calls.push({ pathname, options });
    if (pathname.endsWith('boardList.do')) return toResponse(LIST_HTML, { cookie: 'JSESSIONID=abc; Path=/; HttpOnly' });
    if (pathname.endsWith('boardListAjax.do')) return toResponse(AJAX_HTML);
    if (pathname.endsWith('boardView.do')) return toResponse('<html></html>');
    if (pathname.endsWith('fileListData.do')) {
      const body = JSON.parse(options.body);
      const isValid = options.headers.Cookie === 'JSESSIONID=abc' && options.headers['X-CSRF-TOKEN'] === 'token-1' && body.seq === '136128';
      if (!isValid) return toResponse('error', { status: 500 });
      // 실제 사이트처럼 Accept에 json이 없으면 XML로 답한다.
      return options.headers.Accept?.includes('json') ? toResponse(JSON.stringify({ code: 'SCC', data: files })) : toResponse('<Res></Res>');
    }
    if (pathname.endsWith('fileDownload.do')) return toResponse(workbook);
    return toResponse('not found', { status: 404 });
  };
  return { calls, fetchImpl };
};

const withTempDir = async (run) => {
  const destDir = await mkdtemp(path.join(tmpdir(), 'kapt-download-test-'));
  try {
    await run(destDir);
  } finally {
    await rm(destDir, { recursive: true, force: true });
  }
};

test('최신 글: 순서와 관계없이 날짜가 가장 늦은 글, 없으면 null', () => {
  assert.deepEqual(findLatestPost(AJAX_HTML), { seq: '136128', fileDate: '2026-10-30' });
  assert.equal(findLatestPost('<ul></ul>'), null);
});

test('세션 쿠키·CSRF를 이어 받아 파일을 저장한다', async () => {
  await withTempDir(async (destDir) => {
    const site = createFakeSite();
    const result = await downloadLatestKaptExcel({ destDir, lastFileDate: '2026-10-23', fetchImpl: site.fetchImpl });
    assert.equal(result.fileDate, '2026-10-30');
    assert.deepEqual(await readFile(result.filePath), WORKBOOK);
    assert.equal(new URL(`https://x${site.calls.at(-1).pathname}`).pathname, '/cmm/file/BOARD/fileDownload.do');
  });
});

test('이미 넣은 날짜면 받지 않는다', async () => {
  await withTempDir(async (destDir) => {
    const site = createFakeSite();
    assert.equal(await downloadLatestKaptExcel({ destDir, lastFileDate: '2026-10-30', fetchImpl: site.fetchImpl }), null);
    assert.equal(site.calls.some(({ pathname }) => pathname.endsWith('fileDownload.do')), false);
  });
});

test('엑셀이 아니거나 파일 목록이 비면 실패한다', async () => {
  await withTempDir(async (destDir) => {
    const html = createFakeSite({ workbook: Buffer.from('<html>error</html>') });
    await assert.rejects(downloadLatestKaptExcel({ destDir, fetchImpl: html.fetchImpl }), /not a workbook/);
    const empty = createFakeSite({ files: [] });
    await assert.rejects(downloadLatestKaptExcel({ destDir, fetchImpl: empty.fetchImpl }), /file list empty/);
  });
});

test('요청이 실패하면 경로와 상태를 담아 실패한다', async () => {
  await withTempDir(async (destDir) => {
    const fetchImpl = async () => toResponse('down', { status: 503 });
    await assert.rejects(downloadLatestKaptExcel({ destDir, fetchImpl }), /boardList\.do 503/);
    const offline = async () => {
      throw new TypeError('fetch failed');
    };
    await assert.rejects(downloadLatestKaptExcel({ destDir, fetchImpl: offline }), /boardList\.do TypeError/);
  });
});
