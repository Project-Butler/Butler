// T1 로그인 전 접근 / T4 from 검증 (docs/plan.md 7장)
//   T1 성공: 보호된 주소로 가면 모두 /login. 로그인하면 원래 가려던 곳으로 돌아간다.
//   T1 실패: 보호된 화면이 잠깐이라도 그려짐, 이동이 반복됨.
//   T4 성공: 로그아웃 상태로 /admin/users 에 간 뒤 임대인으로 로그인하면 /landlord/home.  실패: /admin/users 에 머묾.
import { expect, test } from '@playwright/test';
import { adminApiRequests, flashed, installFlashDetector, loginViaUi, roleModuleRequests, watchRequests } from './helpers.js';

const PROTECTED = [
  '/admin/dashboard',
  '/admin/users',
  '/landlord/home',
  '/landlord/contracts',
  '/landlord/community/briefing',
  '/tenant/home',
  '/',
  '/no-such-page',
];

test.describe('T1 로그인 전 접근', () => {
  for (const path of PROTECTED) {
    test(`${path} → /login. 보호 화면은 DOM에 한 번도 나타나지 않고, 이동은 반복되지 않는다`, async ({ page }) => {
      const hops = [];
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) hops.push(new URL(frame.url()).pathname);
      });
      await installFlashDetector(page);
      const urls = watchRequests(page);

      await page.goto(path);

      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
      expect(await flashed(page), '보호된 화면의 표지가 DOM에 나타났다').toEqual([]);

      // 역할 화면은 RequireRole 을 통과한 뒤에만 내려받는다. 로그아웃 상태에서는 어떤 역할의 화면 모듈도 API 도 부르지 않는다
      // (그려지지 않았더라도, lazy 모듈이 이미 내려받아졌다면 문이 열려 있었다는 뜻이다).
      await page.waitForLoadState('networkidle');
      for (const role of ['admin', 'landlord', 'tenant']) {
        expect(roleModuleRequests(urls, role), `로그인 전인데 ${role} 화면 모듈을 내려받았다`).toEqual([]);
      }
      expect(adminApiRequests(urls), '로그인 전인데 관리자 API 를 불렀다').toEqual([]);

      // 이동이 반복되는지는 "서로 다른 주소로 몇 번 옮겨 갔는가"로 본다. 같은 주소로의 replaceState 중복은
      // React Router 의 시작 처리와 개발 모드 StrictMode 의 effect 이중 실행이 만든 것이라 기록을 쌓지 않는다.
      const distinct = hops.filter((hop, index) => index === 0 || hop !== hops[index - 1]);
      expect(distinct, `시작 주소 → /login 한 번뿐이어야 한다 (실제: ${hops.join(' → ')})`).toEqual([path, '/login']);

      const settled = hops.length;
      await page.waitForTimeout(500);
      expect(hops.length, '/login 에 도착한 뒤에도 주소가 계속 바뀐다').toBe(settled);

      // replace 로 옮겼으면 기록이 쌓이지 않는다(빈 시작 칸 + /login). push 였다면 보호 주소가 한 칸 남아 뒤로 가기가 거기로 튕긴다.
      expect(await page.evaluate(() => history.length), '보호 주소가 이동 기록에 남았다').toBeLessThanOrEqual(2);
    });
  }

  test('로그인하면 원래 가려던 곳으로 돌아간다', async ({ page }) => {
    await page.goto('/landlord/contracts');
    await expect(page).toHaveURL(/\/login$/);
    await loginViaUi(page, 'landlord');
    await expect(page).toHaveURL(/\/landlord\/contracts$/);
    await expect(page.getByText('버틀러의 자산').first()).toBeVisible();
  });
});

test.describe('T4 from 검증', () => {
  test('/admin/users 로 가려다 임대인으로 로그인하면 /landlord/home 이다. 관리자 화면은 내려받지 않는다', async ({ page }) => {
    const urls = watchRequests(page);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login$/);

    await loginViaUi(page, 'landlord');

    await expect(page).toHaveURL(/\/landlord\/home$/);
    await expect(page.getByText('버틀러의 자산').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(roleModuleRequests(urls, 'admin'), '관리자 화면 모듈이 내려받아졌다').toEqual([]);
  });
});
