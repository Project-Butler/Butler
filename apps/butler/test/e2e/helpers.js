import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(here, '.auth');
export const statePath = (role) => path.join(AUTH_DIR, `${role}.json`);
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';

// seed 계정(prisma db seed). 역할마다 홈이 다르다.
export const ACCOUNTS = {
  landlord: { email: 'landlord@butler.test', password: 'password123', home: '/landlord/home', name: '김집주' },
  tenant: { email: 'tenant@butler.test', password: 'password123', home: '/tenant/home', name: '이세입' },
  admin: { email: 'admin@butler.test', password: 'password123', home: '/admin/dashboard', name: '박운영' },
};

// 역할 화면에만 있는 표지(DOM에 나타나면 그 화면이 그려진 것). 관리자·임대인 웹은 사이드바의 브랜드 부제목이고,
// 앱 셸·임차인은 셸이 다는 data-shell 이다.
export const MARKER = {
  admin: '관리자 콘솔',
  landlordWeb: '버틀러의 자산',
  landlordApp: 'data-shell="landlord-app"',
  tenant: 'data-shell="tenant"',
};
export const ALL_PROTECTED_MARKERS = Object.values(MARKER);

// 지금 화면이 어느 셸인지. 아무 셸도 없으면 'none'.
export const detectShell = (page) =>
  page.evaluate(() => {
    if (document.querySelector('[data-shell="landlord-app"]')) return 'landlord-app';
    if (document.querySelector('[data-shell="tenant"]')) return 'tenant';
    const text = document.body.innerText;
    if (text.includes('관리자 콘솔')) return 'admin';
    if (text.includes('버틀러의 자산')) return 'landlord-web';
    return 'none';
  });

// 보호된 화면의 표지가 DOM에 "한 번이라도" 추가되면 window.__flashed 에 남긴다(곧 사라져도 기록은 남는다).
// 페이지가 열리기 전에 심어야 하므로 page.goto 전에 부른다.
export const installFlashDetector = (page, markers = ALL_PROTECTED_MARKERS) =>
  page.addInitScript((list) => {
    window.__flashed = [];
    const check = (node) => {
      const html = node.outerHTML ?? node.textContent ?? '';
      for (const marker of list) if (html.includes(marker)) window.__flashed.push(marker);
    };
    new MutationObserver((mutations) => {
      for (const mutation of mutations) mutation.addedNodes.forEach(check);
    }).observe(document, { childList: true, subtree: true });
  }, markers);

export const flashed = (page) => page.evaluate(() => window.__flashed ?? []);

// 콘솔 error · 처리 안 된 예외 · 4xx/5xx 응답 · 실패한 요청을 모은다 (T8).
export const watchIssues = (page) => {
  const issues = { consoleErrors: [], pageErrors: [], badResponses: [], failedRequests: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') issues.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => issues.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) issues.badResponses.push(`${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`);
  });
  page.on('requestfailed', (request) => issues.failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
  return issues;
};

// 보낸 요청의 URL 을 모두 기록한다 (T3 — 다른 역할의 API 요청·모듈 로드가 0건인지).
export const watchRequests = (page) => {
  const urls = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
};

// 개발 서버가 내려주는 역할 화면 모듈(청크)과 역할 전용 API 를 구분한다.
export const roleModuleRequests = (urls, role) => urls.filter((url) => new URL(url).pathname.startsWith(`/src/${role}/`));
export const adminApiRequests = (urls) => urls.filter((url) => new URL(url).pathname.startsWith('/api/v1/admin/'));

// 로그인 화면으로 로그인한다. 로그인은 이메일당 10분 10회로 제한되므로 꼭 필요한 테스트에서만 쓴다.
export const loginViaUi = async (page, role) => {
  const account = ACCOUNTS[role];
  await page.getByLabel('이메일').fill(account.email);
  await page.getByLabel('비밀번호').fill(account.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
};
