// T7 surface (docs/plan.md 7장)
//   성공: PC(마우스) 브라우저는 창을 767px 이하로 줄이고 새로고침해도 웹이 유지됨. 휴대폰 UA 는 앱.
//         터치 기기 + 데스크톱 UA + 폭 767px 이하는 앱, 같은 조건에서 768px 이상은 웹. 열어 둔 채 창 크기만 바꾸면 셸이 그대로.
//         휴대폰으로 연 뒤 PC로 열면 웹이 나옴. 배포 빌드에서 ?surface= 를 무시함(→ t7-surface.prod.spec.js).
//   실패: 어긋남.  아이패드처럼 에뮬레이션할 수 없는 기기는 "실행 불가"로 보고한다.
// 아래 환경 값은 Playwright(Chromium)로 http://localhost 에서 실제로 읽어 확인했다(userAgentData.mobile · pointer: coarse · innerWidth).
import { devices, expect, test } from '@playwright/test';
import { detectShell, statePath } from './helpers.js';

const BASE_URL = 'http://localhost:5173';
const pc = (width, height = 800) => ({ viewport: { width, height } });
const touchDesktop = (width, height = 800) => ({ viewport: { width, height }, hasTouch: true });

// 지정한 환경으로 컨텍스트를 만들고 path 를 열어, 셸이 그려질 때까지 기다린 뒤 돌려준다.
const openAs = async (browser, options, { path = '/landlord/home', role = 'landlord' } = {}) => {
  const context = await browser.newContext({ ...options, storageState: statePath(role), baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto(path);
  await expect.poll(() => detectShell(page), { message: '셸이 그려지지 않았다' }).not.toBe('none');
  return { context, page };
};

const LANDLORD_CASES = [
  ['PC 1280 (마우스)', pc(1280), 'landlord-web'],
  ['PC 창 767 (마우스) — 폭만으로는 앱이 되지 않는다', pc(767), 'landlord-web'],
  ['PC 창 320 (마우스)', pc(320), 'landlord-web'],
  ['iPhone 13 (휴대폰 UA)', devices['iPhone 13'], 'landlord-app'],
  ['Pixel 7 (휴대폰 UA)', devices['Pixel 7'], 'landlord-app'],
  ['터치 + 데스크톱 UA, 폭 700', touchDesktop(700), 'landlord-app'],
  ['터치 + 데스크톱 UA, 폭 767 (경계 아래)', touchDesktop(767), 'landlord-app'],
  ['터치 + 데스크톱 UA, 폭 768 (경계)', touchDesktop(768), 'landlord-web'],
  ['터치 + 데스크톱 UA, 폭 1024', touchDesktop(1024), 'landlord-web'],
];

test.describe('T7 임대인: 환경별 화면 형태', () => {
  for (const [name, options, expected] of LANDLORD_CASES) {
    test(`${name} → ${expected}. 새로고침해도 같다`, async ({ browser }) => {
      const { context, page } = await openAs(browser, options);
      expect(await detectShell(page)).toBe(expected);

      await page.reload();
      await expect.poll(() => detectShell(page)).not.toBe('none');
      expect(await detectShell(page), '새로고침 뒤 셸이 바뀌었다').toBe(expected);
      await context.close();
    });
  }
});

test.describe('T7 열어 둔 채 창 크기만 바꾸면 셸은 그대로 (입력 중인 폼 보호)', () => {
  test('웹으로 연 뒤 창을 500px 로 줄여도 웹이고, 입력한 값이 남아 있다', async ({ browser }) => {
    const { context, page } = await openAs(browser, pc(1280), { path: '/landlord/contracts/new' });
    expect(await detectShell(page)).toBe('landlord-web');
    // 숫자 전용 칸(보증금 등)은 글자를 지우므로, 일반 텍스트 칸인 '임차인 이름'에 넣는다.
    const field = page.getByLabel('임차인 이름');
    await field.fill('입력 중인 값');
    await expect(field, '창 크기를 바꾸기 전부터 값이 들어가지 않는다 — 테스트 전제가 틀렸다').toHaveValue('입력 중인 값');

    await page.setViewportSize({ width: 500, height: 800 });
    await page.waitForTimeout(500);

    expect(await detectShell(page), '창을 줄이자 셸이 바뀌었다').toBe('landlord-web');
    await expect(field, '창을 줄이자 입력 중이던 값이 사라졌다').toHaveValue('입력 중인 값');
    await context.close();
  });

  test('앱으로 연 뒤 창을 1200px 로 넓혀도 앱이다', async ({ browser }) => {
    const { context, page } = await openAs(browser, touchDesktop(700));
    expect(await detectShell(page)).toBe('landlord-app');

    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(500);

    expect(await detectShell(page), '창을 넓히자 셸이 바뀌었다').toBe('landlord-app');
    await context.close();
  });
});

test.describe('T7 판단 결과를 저장하지 않는다', () => {
  test('휴대폰으로 연 뒤 PC로 열면 웹이 나온다', async ({ browser }) => {
    const phone = await openAs(browser, devices['iPhone 13']);
    expect(await detectShell(phone.page)).toBe('landlord-app');
    await phone.context.close();

    const desktop = await openAs(browser, pc(1280));
    expect(await detectShell(desktop.page), '이전에 휴대폰으로 열었다는 이유로 앱이 나왔다').toBe('landlord-web');
    await desktop.context.close();
  });

  test('쿠키·localStorage·sessionStorage 에 surface 흔적을 남기지 않는다', async ({ browser }) => {
    const { context, page } = await openAs(browser, devices['iPhone 13']);
    const stored = await page.evaluate(() => ({
      cookies: document.cookie,
      local: Object.entries(localStorage).map(([key, value]) => `${key}=${value}`),
      session: Object.entries(sessionStorage).map(([key, value]) => `${key}=${value}`),
    }));
    expect(stored.cookies).not.toMatch(/surface/i);
    expect(stored.local.filter((entry) => /surface/i.test(entry))).toEqual([]);
    expect(stored.session.filter((entry) => /surface/i.test(entry))).toEqual([]);
    await context.close();
  });
});

test.describe('T7 관리자·임차인은 고정', () => {
  test('관리자는 휴대폰에서도 웹 셸', async ({ browser }) => {
    const { context, page } = await openAs(browser, devices['iPhone 13'], { path: '/admin/dashboard', role: 'admin' });
    expect(await detectShell(page)).toBe('admin');
    await context.close();
  });

  for (const [name, options] of [['PC 1280', pc(1280)], ['iPhone 13', devices['iPhone 13']]]) {
    test(`임차인은 ${name} 에서도 앱 화면`, async ({ browser }) => {
      const { context, page } = await openAs(browser, options, { path: '/tenant/home', role: 'tenant' });
      expect(await detectShell(page)).toBe('tenant');
      await context.close();
    });
  }
});

test.describe('T7 개발 환경의 ?surface= 덮어쓰기', () => {
  test('PC 에서 ?surface=app → 앱', async ({ browser }) => {
    const { context, page } = await openAs(browser, pc(1280), { path: '/landlord/home?surface=app' });
    expect(await detectShell(page)).toBe('landlord-app');
    await context.close();
  });

  test('휴대폰에서 ?surface=web → 웹', async ({ browser }) => {
    const { context, page } = await openAs(browser, devices['iPhone 13'], { path: '/landlord/home?surface=web' });
    expect(await detectShell(page)).toBe('landlord-web');
    await context.close();
  });
});

// 아이패드(iPadOS Safari)는 UA 가 Mac 이고 userAgentData 도 없어, Playwright 의 iPad 프로필(UA 는 iPad, mobile=true)로는 재현되지 않는다.
test('아이패드처럼 에뮬레이션할 수 없는 기기 — 실행 불가로 보고', () => {
  test.skip(true, '실행 불가: 실제 iPadOS Safari(UA=Mac, userAgentData 없음)는 Playwright 로 재현할 수 없다. 판단 규칙은 단위 테스트(test/surface)가 확인한다.');
});
