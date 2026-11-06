// T2 역할 × 화면 형태 (docs/plan.md 7장)
//   성공: ADMIN 웹 셸, LANDLORD desktop 웹 셸, LANDLORD mobile 앱 셸 + 탭 4칸이 맞는 주소로 이동 (TENANT 는 tenant 스펙 하단).
//   실패: 셸이 틀림, 빈 화면, 기준선과 다름.
// "기준선과 같음"(화면 내용 · 콘솔 · 네트워크)은 기준선 캡처 비교 도구로 64개 경로를 확인했다(docs/baseline-97). 이 스펙은 메뉴·탭 이동을 본다.
import { devices, expect, test } from '@playwright/test';
import { detectShell, loginViaUi, statePath } from './helpers.js';

const BASE_URL = 'http://localhost:5173';
const openAs = async (browser, role, options, path) => {
  const context = await browser.newContext({ ...options, storageState: statePath(role), baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto(path);
  await expect.poll(() => detectShell(page)).not.toBe('none');
  return { context, page };
};

// [사이드바 이름, 가야 할 주소]
const ADMIN_MENU = [
  ['대시보드', '/admin/dashboard'],
  ['회원', '/admin/users'],
  ['소유 관계', '/admin/ownerships'],
  ['인증 시도', '/admin/ownership-verification-attempts'],
  ['단지 등록', '/admin/complexes/new'],
  ['작업', '/admin/jobs'],
  ['감사 로그', '/admin/audit-logs'],
  ['계약', '/admin/contracts'],
  ['유지보수', '/admin/tickets'],
  ['문서', '/admin/documents'],
];
const LANDLORD_MENU = [
  ['홈', '/landlord/home'],
  ['내 부동산', '/landlord/buildings'],
  ['계약', '/landlord/contracts'],
  ['유지보수 요청', '/landlord/tickets'],
  ['관리 로그', '/landlord/logs'],
  ['문서', '/landlord/documents'],
  ['커뮤니티', '/landlord/community/briefing'], // /landlord/community 는 브리핑으로 바꿔 끼운다
  ['임대차 분쟁', '/landlord/disputes'],
];
const LANDLORD_TABS = [
  ['홈', '/landlord/home'],
  ['내 자산', '/landlord/buildings'],
  ['커뮤니티', '/landlord/community'],
  ['내 정보', '/landlord/settings'],
];

test.describe('T2 ADMIN: 웹 셸 (모바일에서도 웹 셸)', () => {
  test('PC: 관리자 셸이고, 메뉴를 누르면 /admin/… 으로 간다', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'admin', { viewport: { width: 1280, height: 800 } }, '/admin/dashboard');
    expect(await detectShell(page)).toBe('admin');
    const sidebar = page.locator('aside');
    for (const [name, path] of ADMIN_MENU) {
      await sidebar.getByRole('button', { name: new RegExp(`^${name}`) }).click();
      await expect(page, `[${name}]`).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
      expect(await detectShell(page), `[${name}] 뒤 셸`).toBe('admin');
    }
    await sidebar.getByRole('button', { name: '설정' }).click();
    await expect(page).toHaveURL(/\/admin\/settings$/);
    await context.close();
  });

  test('휴대폰: 앱 셸이 아니라 웹 셸', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'admin', devices['iPhone 13'], '/admin/dashboard');
    expect(await detectShell(page)).toBe('admin');
    await expect(page.locator('[data-shell="landlord-app"]')).toHaveCount(0);
    await context.close();
  });

  test('메뉴로 간 상세 화면에서도 메뉴 선택이 유지된다 (회원 상세 → 회원)', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'admin', { viewport: { width: 1280, height: 800 } }, '/admin/users');
    await page.locator('table tbody tr').first().click();
    await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]+$/);
    expect(await detectShell(page)).toBe('admin');
    await context.close();
  });
});

test.describe('T2 LANDLORD desktop: 웹 셸', () => {
  test('사이드바 메뉴를 누르면 /landlord/… 으로 가고, 누른 메뉴가 선택 표시된다', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'landlord', { viewport: { width: 1280, height: 800 } }, '/landlord/home');
    expect(await detectShell(page)).toBe('landlord-web');
    const sidebar = page.locator('aside nav');
    for (const [name, path] of LANDLORD_MENU) {
      const item = sidebar.getByRole('button', { name: new RegExp(`^${name}`) });
      await item.click();
      await expect(page, `[${name}]`).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
      expect(await detectShell(page), `[${name}] 뒤 셸`).toBe('landlord-web');
      await expect(item, `[${name}] 선택 표시`).toHaveClass(/bg-accent-soft/);
    }
    await page.locator('aside').getByRole('button', { name: '설정' }).click();
    await expect(page).toHaveURL(/\/landlord\/settings$/);
    await context.close();
  });

  test('계약 목록 → 계약 등록 → 목록처럼 화면 안의 이동도 /landlord 아래에서 이어진다', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'landlord', { viewport: { width: 1280, height: 800 } }, '/landlord/contracts');
    await page.getByRole('button', { name: /계약 등록/ }).first().click();
    await expect(page).toHaveURL(/\/landlord\/contracts\/new$/);
    expect(await detectShell(page)).toBe('landlord-web');
    await context.close();
  });
});

test.describe('T2 LANDLORD mobile: 앱 셸 + 탭 4칸', () => {
  test('앱 셸에 탭 4칸이 홈 · 내 자산 · 커뮤니티 · 내 정보 순서로 있다', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'landlord', devices['iPhone 13'], '/landlord/home');
    expect(await detectShell(page)).toBe('landlord-app');
    const labels = await page.getByRole('navigation', { name: '하단 메뉴' }).getByRole('button').allTextContents();
    expect(labels).toEqual(['홈', '내 자산', '커뮤니티', '내 정보']);
    await expect(page.getByRole('region', { name: '준비 중' })).toBeVisible();
    await context.close();
  });

  test('탭을 누르면 맞는 주소로 이동하고, 활성 표시가 따라 움직인다', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'landlord', devices['iPhone 13'], '/landlord/home');
    const nav = page.getByRole('navigation', { name: '하단 메뉴' });
    for (const [label, path] of [...LANDLORD_TABS.slice(1), LANDLORD_TABS[0]]) {
      await nav.getByRole('button', { name: label }).click();
      await expect(page, `[${label}]`).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
      await expect(nav.getByRole('button', { name: label }), `[${label}] 활성`).toHaveAttribute('aria-current', 'page');
      await expect(nav.locator('[aria-current="page"]'), '활성 탭은 하나뿐').toHaveCount(1);
      expect(await detectShell(page)).toBe('landlord-app');
      await expect(page.getByRole('region', { name: '준비 중' })).toBeVisible();
    }
    await context.close();
  });

  test('웹 화면이 모바일에 그대로 나오지 않는다: 계약·커뮤니티 하위 주소도 앱 셸의 준비 중이다', async ({ browser }) => {
    for (const path of ['/landlord/contracts', '/landlord/community/briefing', '/landlord/properties/new']) {
      const { context, page } = await openAs(browser, 'landlord', devices['iPhone 13'], path);
      expect(await detectShell(page), path).toBe('landlord-app');
      await expect(page.getByRole('region', { name: '준비 중' }), path).toBeVisible();
      await expect(page.getByText('버틀러의 자산'), `${path} 에 웹 사이드바가 나왔다`).toHaveCount(0);
      await context.close();
    }
  });

  test('내 정보에서 로그아웃하면 /login 으로 가고, 뒤로 가도 앱 화면이 보이지 않는다', async ({ browser }) => {
    // 로그아웃은 서버 세션을 없애므로, 다른 스펙이 같이 쓰는 저장된 로그인이 아니라 자기 로그인을 한다(속도 제한 안에서 1회).
    const context = await browser.newContext({ ...devices['iPhone 13'], baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto('/login');
    await loginViaUi(page, 'landlord');
    await expect(page).toHaveURL(/\/landlord\/home$/);
    expect(await detectShell(page)).toBe('landlord-app');

    await page.getByRole('navigation', { name: '하단 메뉴' }).getByRole('button', { name: '내 정보' }).click();
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('[data-shell="landlord-app"]')).toHaveCount(0);
    await context.close();
  });
});

test.describe('T2 TENANT: 항상 앱 셸 (PC 에서는 가운데 모바일 폭)', () => {
  test('PC 1280: 앱 셸이 430px 이하 폭으로 화면 가운데에 놓인다', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'tenant', { viewport: { width: 1280, height: 800 } }, '/tenant/home');
    expect(await detectShell(page)).toBe('tenant');
    const box = await page.locator('[data-shell="tenant"]').boundingBox();
    expect(box.width, '모바일 폭(430px)을 넘는다').toBeLessThanOrEqual(430);
    expect(box.width, '너무 좁다').toBeGreaterThan(300);
    expect(Math.abs(box.x + box.width / 2 - 640), `가운데가 아니다(왼쪽 ${box.x}px · 폭 ${box.width}px)`).toBeLessThanOrEqual(1);
    await context.close();
  });

  test('휴대폰(iPhone 13): 화면 폭 전체를 쓴다', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'tenant', devices['iPhone 13'], '/tenant/home');
    expect(await detectShell(page)).toBe('tenant');
    const box = await page.locator('[data-shell="tenant"]').boundingBox();
    expect(box.x).toBe(0);
    expect(box.width).toBe(390);
    await context.close();
  });

  test('탭 2칸(홈 · 내 정보): 누르면 맞는 주소로 가고 활성 표시가 따라 움직인다', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'tenant', { viewport: { width: 1280, height: 800 } }, '/tenant/home');
    const nav = page.getByRole('navigation', { name: '하단 메뉴' });
    expect(await nav.getByRole('button').allTextContents()).toEqual(['홈', '내 정보']);
    for (const [label, path] of [['내 정보', '/tenant/settings'], ['홈', '/tenant/home']]) {
      await nav.getByRole('button', { name: label }).click();
      await expect(page, `[${label}]`).toHaveURL(new RegExp(`${path.replaceAll('/', '\/')}$`));
      await expect(nav.getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page');
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(page.getByRole('region', { name: '준비 중' })).toBeVisible();
    }
    await context.close();
  });

  test('내 정보에서 로그아웃하면 /login 이고, 뒤로 가도 임차인 화면이 보이지 않는다', async ({ browser }) => {
    // 로그아웃은 서버 세션을 없애므로 다른 스펙이 같이 쓰는 저장된 로그인이 아니라 자기 로그인을 한다.
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto('/login');
    await loginViaUi(page, 'tenant');
    await expect(page).toHaveURL(/\/tenant\/home$/);
    expect(await detectShell(page)).toBe('tenant');

    await page.getByRole('navigation', { name: '하단 메뉴' }).getByRole('button', { name: '내 정보' }).click();
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('[data-shell="tenant"]')).toHaveCount(0);
    await context.close();
  });
});
