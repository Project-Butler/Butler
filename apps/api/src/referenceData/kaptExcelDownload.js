// K-apt 자료실의 최신 기본정보 엑셀을 임시 폴더로 받는다(HTTP만, 브라우저·외부 패키지 없음).
// 순서: 목록 화면(쿠키·CSRF) → 목록 조회(최신 글) → 글 열기 → 파일 목록 등록(JSON + X-CSRF-TOKEN) → 내려받기. 세션에 묶여 있어 순서를 지킨다.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ImportGateError } from './referenceImports.js';

const BASE_URL = 'https://www.k-apt.go.kr';
const LIST_URL = `${BASE_URL}/web/board/webReference/boardList.do`;
const LIST_AJAX_URL = `${BASE_URL}/web/board/webReference/boardListAjax.do`;
const VIEW_URL = `${BASE_URL}/web/board/webReference/boardView.do`;
const FILE_LIST_URL = `${BASE_URL}/web/board/webReference/fileListData.do?seq=BOARD_FILE`;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 120_000;
const MIN_FILE_BYTES = 5_000_000;
const XLSX_MAGIC = '504b0304';

const BOARD_FIELDS = { boardType: '03', pageNo: '1', keyword: '' };
const POST_PATTERN = /goCheck\((\d+),[^>]*>[^<]*기본정보\((\d{4})\.(\d{2})\.(\d{2})\.?\)/g;
const CSRF_PATTERN = /name=["']_csrf["'][^>]*content=["']([^"']+)/;

// 목록 HTML → 글 중 날짜가 가장 늦은 { seq, fileDate: 'YYYY-MM-DD' } 또는 null
export const findLatestPost = (html) => {
  const posts = [...html.matchAll(POST_PATTERN)].map(([, seq, year, month, day]) => ({ seq, fileDate: `${year}-${month}-${day}` }));
  return posts.reduce((latest, post) => (!latest || post.fileDate > latest.fileDate ? post : latest), null);
};

const createSession = (fetchImpl) => {
  const cookies = new Map();
  return async (url, { headers = {}, ...options } = {}) => {
    const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT, ...(cookie ? { Cookie: cookie } : {}), ...headers },
    }).catch((error) => {
      throw new ImportGateError(`k-apt request failed: ${new URL(url).pathname} ${error.name}`);
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const at = pair.indexOf('=');
      cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    if (!response.ok) throw new ImportGateError(`k-apt request failed: ${new URL(url).pathname} ${response.status}`);
    return response;
  };
};

const toFormRequest = (fields, referer) => ({
  method: 'POST',
  body: new URLSearchParams(fields).toString(),
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE_URL, Referer: referer },
});

// lastFileDate 이후 글이 없으면 null(받지 않음). 있으면 destDir에 저장하고 { filePath, fileDate }.
export const downloadLatestKaptExcel = async ({ destDir, lastFileDate = null, fetchImpl = fetch }) => {
  const request = createSession(fetchImpl);

  const listHtml = await (await request(LIST_URL)).text();
  const csrf = listHtml.match(CSRF_PATTERN)?.[1];
  if (!csrf) throw new ImportGateError('k-apt format changed: csrf token not found');

  const ajaxHtml = await (
    await request(LIST_AJAX_URL, toFormRequest({ ...BOARD_FIELDS, scode: '01', stype: '', _csrf: csrf }, LIST_URL))
  ).text();
  const latest = findLatestPost(ajaxHtml);
  if (!latest) throw new ImportGateError('k-apt format changed: latest post not found');
  if (lastFileDate && latest.fileDate <= lastFileDate) return null;

  await request(VIEW_URL, toFormRequest({ ...BOARD_FIELDS, seq: latest.seq, boardSecret: '0', board_pwd: '', scodeT: '01', _csrf: csrf }, LIST_URL));

  const fileListResponse = await request(FILE_LIST_URL, {
    method: 'POST',
    body: JSON.stringify({ ...BOARD_FIELDS, stype: '', seq: latest.seq, scode: '01', boardPwd: '', _csrf: csrf }),
    headers: {
      // Accept가 없으면 서버가 XML로 답한다.
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/json;charset=UTF-8',
      'X-CSRF-TOKEN': csrf,
      'X-Requested-With': 'XMLHttpRequest',
      Origin: BASE_URL,
      Referer: VIEW_URL,
    },
  });
  const fileList = await fileListResponse.json().catch(() => {
    throw new ImportGateError('k-apt format changed: file list is not json');
  });
  const file = fileList.data?.[0];
  if (!file?.fileName) throw new ImportGateError('k-apt format changed: file list empty');

  const download = await request(
    `${BASE_URL}/cmm/file/BOARD/fileDownload.do?key=${file.seq}&fileName=${encodeURIComponent(file.fileName)}`,
    { headers: { Referer: VIEW_URL } },
  );
  const bytes = Buffer.from(await download.arrayBuffer());
  if (bytes.subarray(0, 4).toString('hex') !== XLSX_MAGIC || bytes.length < MIN_FILE_BYTES) {
    throw new ImportGateError(`k-apt download is not a workbook: ${bytes.length} bytes`);
  }

  const filePath = path.join(destDir, `kapt-basic-${latest.fileDate}.xlsx`);
  await writeFile(filePath, bytes);
  return { filePath, fileDate: latest.fileDate };
};
