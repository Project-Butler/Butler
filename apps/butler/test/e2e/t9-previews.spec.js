// T9 미리보기 (docs/plan.md 7장): /dispute-preview.html, /dispute-chat.html 이 열린다.  실패: 빈 화면이거나 오류.
// 두 페이지는 개발용 진입점이라 자체 로그인 화면을 거친다. 로그인은 이메일당 10분 10회로 제한되므로, 저장해 둔 세션 쿠키를 쓰고
// 로그인 요청만 가짜로 응답한다(실제 로그인 흐름은 T1·T4·T5 가 확인한다). 미리보기가 부르는 나머지 API 는 진짜 세션으로 응답받는다.
import { expect, test } from '@playwright/test';
import { ACCOUNTS, loginViaUi, statePath, watchIssues } from './helpers.js';

test.describe('T9 개발용 미리보기', () => {
  test.use({ storageState: statePath('landlord') });

  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/login', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', json: { data: { user: { id: 'preview', email: ACCOUNTS.landlord.email, name: ACCOUNTS.landlord.name, role: 'LANDLORD' }, verifiedLegalDongCodes: [] } } }),
    );
  });

  test('/dispute-preview.html: 열리고, 로그인하면 분쟁 해결사 첫 화면, 상황을 누르면 상황별 안내로 간다', async ({ page }) => {
    const issues = watchIssues(page);
    await page.goto('/dispute-preview.html');
    await expect(page.getByText('분쟁 해결사 미리보기')).toBeVisible();

    await loginViaUi(page, 'landlord');

    await expect(page.getByRole('heading', { name: '임대차 분쟁 센터' })).toBeVisible();
    // 미리보기 안의 이동이 /landlord 접두어가 붙은 경로로도 이어지는지 — 상황별 안내까지 간다.
    await page.getByRole('button', { name: /보증금 반환/ }).first().click();
    await expect(page.getByRole('heading', { name: '보증금 반환' }).first()).toBeVisible();

    await page.waitForLoadState('networkidle');
    expect(issues.pageErrors, '처리 안 된 예외').toEqual([]);
    expect(issues.consoleErrors.filter((text) => !/status of 401/.test(text)), '콘솔 error').toEqual([]);
  });

  test('/dispute-chat.html: 열리고, 로그인하면 AI 분쟁 상담 화면이 보인다', async ({ page }) => {
    const issues = watchIssues(page);
    await page.goto('/dispute-chat.html');
    await expect(page.getByText('AI 분쟁 상담 미리보기')).toBeVisible();

    await loginViaUi(page, 'landlord');

    await expect(page.getByRole('heading', { name: 'AI 분쟁 상담' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(issues.pageErrors, '처리 안 된 예외').toEqual([]);
    expect(issues.consoleErrors.filter((text) => !/status of 401/.test(text)), '콘솔 error').toEqual([]);
  });

  test('두 페이지 모두 로그인 전에도 빈 화면이 아니다', async ({ page }) => {
    for (const path of ['/dispute-preview.html', '/dispute-chat.html']) {
      await page.goto(path);
      const text = await page.locator('#root').innerText();
      expect(text.trim().length, `${path} 가 빈 화면이다`).toBeGreaterThan(0);
    }
  });
});
