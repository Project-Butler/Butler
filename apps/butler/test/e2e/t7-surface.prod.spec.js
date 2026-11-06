// T7 배포 빌드: ?surface= 덮어쓰기는 개발 환경에서만 동작한다 (docs/plan.md 2장·7장). 성공: 배포 빌드에서 무시함.  실패: 어긋남.
// playwright.prod.config.js 가 vite build → vite preview 로 띄운 서버를 대상으로 한다 (npm run test:e2e:prod).
import { devices, expect, test } from '@playwright/test';
import { detectShell, statePath } from './helpers.js';

const openAs = async (browser, options, path) => {
  const context = await browser.newContext({ ...options, storageState: statePath('landlord'), baseURL: 'http://localhost:5173' });
  const page = await context.newPage();
  await page.goto(path);
  await expect.poll(() => detectShell(page)).not.toBe('none');
  return { context, page };
};

test.describe('T7 배포 빌드', () => {
  test('양성 대조: 덮어쓰기 없이 PC 는 웹, 휴대폰은 앱', async ({ browser }) => {
    const pc = await openAs(browser, { viewport: { width: 1280, height: 800 } }, '/landlord/home');
    expect(await detectShell(pc.page)).toBe('landlord-web');
    await pc.context.close();

    const phone = await openAs(browser, devices['iPhone 13'], '/landlord/home');
    expect(await detectShell(phone.page)).toBe('landlord-app');
    await phone.context.close();
  });

  test('PC 에서 ?surface=app 을 붙여도 웹이다 (배포 빌드는 덮어쓰기를 무시한다)', async ({ browser }) => {
    const { context, page } = await openAs(browser, { viewport: { width: 1280, height: 800 } }, '/landlord/home?surface=app');
    expect(await detectShell(page), '배포 빌드가 ?surface=app 을 따랐다').toBe('landlord-web');
    await context.close();
  });

  test('휴대폰에서 ?surface=web 을 붙여도 앱이다', async ({ browser }) => {
    const { context, page } = await openAs(browser, devices['iPhone 13'], '/landlord/home?surface=web');
    expect(await detectShell(page), '배포 빌드가 ?surface=web 을 따랐다').toBe('landlord-app');
    await context.close();
  });

  test('이 서버는 정말 배포 빌드다 (개발 서버의 /@vite/client 가 없다)', async ({ request }) => {
    const response = await request.get('/@vite/client');
    const body = await response.text();
    expect(body, '개발 서버를 대상으로 돌고 있다').not.toContain('createHotContext');
  });
});
