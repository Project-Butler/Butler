// T5 세션 (docs/plan.md 7장)
//   성공: 새로고침해도 로그인 유지. 로그아웃하면 /login. 뒤로 가기를 해도 보호된 화면이 안 보임. 쿠키를 지우면 /login 으로 감.  실패: 어긋남.
import { expect, test } from '@playwright/test';
import { ALL_PROTECTED_MARKERS, API_URL, flashed, installFlashDetector, loginViaUi, statePath } from './helpers.js';

const landlordShell = (page) => page.getByText('버틀러의 자산').first();

test.describe('T5 세션 (저장해 둔 로그인 사용)', () => {
  test.use({ storageState: statePath('landlord') });

  test('새로고침해도 로그인이 유지되고 보던 화면에 그대로 있다', async ({ page }) => {
    await page.goto('/landlord/contracts');
    await expect(landlordShell(page)).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/landlord\/contracts$/);
    await expect(landlordShell(page)).toBeVisible();
  });

  test('쿠키를 지우고 새로고침하면 /login 으로 간다', async ({ page, context }) => {
    await page.goto('/landlord/home');
    await expect(landlordShell(page)).toBeVisible();

    await context.clearCookies();
    await page.reload();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
  });
});

test.describe('T5 로그아웃 (자기 로그인으로 — 세션을 없애므로 저장해 둔 로그인을 쓰지 않는다)', () => {
  test('로그아웃하면 /login 이고, 뒤로 가기를 해도 보호된 화면이 그려지지 않는다', async ({ page }) => {
    await page.goto('/login');
    await loginViaUi(page, 'landlord');
    await expect(page).toHaveURL(/\/landlord\/home$/);
    await expect(landlordShell(page)).toBeVisible();

    // 이동 기록에 보호 화면이 둘 이상 쌓이게 한 칸 더 이동한다.
    // 대시보드에도 '계약…' 버튼이 있어 사이드바 안으로 범위를 좁힌다.
    await page.locator('aside nav').getByRole('button', { name: /^계약/ }).click();
    await expect(page).toHaveURL(/\/landlord\/contracts$/);

    // 사용자 메뉴는 hover 로 열린다.
    await page.getByRole('button', { name: '사용자 메뉴' }).hover();
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // 서버 세션도 실제로 끝났다 (화면만 로그아웃된 척하지 않는다)
    const me = await page.request.get(`${API_URL}/auth/me`);
    expect(me.status(), '로그아웃 뒤에도 서버가 로그인 상태로 본다').toBe(401);

    // 이제부터 보호된 화면이 한 번이라도 DOM에 나타나면 실패다.
    await installFlashDetector(page, ALL_PROTECTED_MARKERS);
    await page.evaluate((markers) => {
      window.__flashed = [];
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            const html = node.outerHTML ?? node.textContent ?? '';
            for (const marker of markers) if (html.includes(marker)) window.__flashed.push(marker);
          });
        }
      }).observe(document, { childList: true, subtree: true });
    }, ALL_PROTECTED_MARKERS);

    await page.goBack();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    expect(await flashed(page), '뒤로 가기에서 보호된 화면이 그려졌다').toEqual([]);
  });
});
