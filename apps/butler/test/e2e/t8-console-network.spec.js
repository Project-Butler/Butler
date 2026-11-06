// T8 콘솔·네트워크 (docs/plan.md 7장)
//   성공: 기준선에 없던 콘솔 error 와 처리 안 된 예외가 0건. 의도하지 않은 4xx/5xx 가 0건.  실패: 1건 이상.
// 기준선(바뀌기 전 dev)에서 이미 있던 것은 딱 두 가지다 — 로그아웃 상태에서 세션을 확인하는 GET /auth/me 의 401,
// 그리고 /register/oauth 가 소셜 가입 정보를 읽는 GET /auth/oauth/signup 의 401 (브라우저가 콘솔에 error 로 남긴다).
// 로그인한 화면에서는 그 외 아무것도 허용하지 않는다. React Router 의 future flag 경고는 warning 이라 error 로 세지 않는다.
import { expect, test } from '@playwright/test';
import { statePath, watchIssues } from './helpers.js';

const ROUTES = {
  admin: [
    '/admin',
    '/admin/dashboard',
    '/admin/users',
    '/admin/ownerships',
    '/admin/ownership-verification-attempts',
    '/admin/complexes/new',
    '/admin/jobs',
    '/admin/audit-logs',
    '/admin/contracts',
    '/admin/tickets',
    '/admin/documents',
    '/admin/settings',
    '/admin/no-such-page',
  ],
  landlord: [
    '/landlord',
    '/landlord/home',
    '/landlord/buildings',
    '/landlord/properties',
    '/landlord/properties?relation=FORMER_OWNER',
    '/landlord/properties/new',
    '/landlord/support/inquiry',
    '/landlord/contracts',
    '/landlord/contracts/new',
    '/landlord/logs',
    '/landlord/logs/new',
    '/landlord/setup',
    '/landlord/disputes',
    '/landlord/disputes/search?q=%EB%B3%B4%EC%A6%9D%EA%B8%88',
    '/landlord/disputes/topics/deposit',
    '/landlord/disputes/chat',
    '/landlord/community',
    '/landlord/community/briefing',
    '/landlord/community/market',
    '/landlord/community/news',
    '/landlord/community/board',
    '/landlord/community/polls',
    '/landlord/community/polls/new',
    '/landlord/community/posts/new',
    '/landlord/community/buildings',
    '/landlord/settings',
    '/landlord/tickets',
    '/landlord/documents',
    '/landlord/no-such-page',
  ],
  tenant: ['/tenant', '/tenant/home', '/tenant/no-such-page'],
};

for (const [role, routes] of Object.entries(ROUTES)) {
  test.describe(`T8 ${role} 로그인 상태: 콘솔 error·예외·4xx/5xx·실패한 요청 0건`, () => {
    test.use({ storageState: statePath(role) });

    for (const route of routes) {
      test(route, async ({ page }) => {
        const issues = watchIssues(page);
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);

        expect(issues.pageErrors, '처리 안 된 예외').toEqual([]);
        expect(issues.consoleErrors, '콘솔 error').toEqual([]);
        expect(issues.badResponses, '의도하지 않은 4xx/5xx').toEqual([]);
        expect(issues.failedRequests, '실패한 요청').toEqual([]);
      });
    }
  });
}

// 로그아웃 상태: 기준선에 있던 401 만 허용한다. 그 401 마다 브라우저가 콘솔 error 를 하나씩 남기므로 개수도 같아야 한다.
const PUBLIC = [
  ['/login', ['GET /api/v1/auth/me 401']],
  ['/register', ['GET /api/v1/auth/me 401']],
  ['/register/oauth', ['GET /api/v1/auth/me 401', 'GET /api/v1/auth/oauth/signup 401']],
  ['/login?oauth_error=OAUTH_ROLE_NOT_ALLOWED', ['GET /api/v1/auth/me 401']],
  ['/admin/users', ['GET /api/v1/auth/me 401']],
  ['/landlord/home', ['GET /api/v1/auth/me 401']],
];

test.describe('T8 로그아웃 상태: 기준선에 있던 401 외에는 0건', () => {
  for (const [route, allowed] of PUBLIC) {
    test(route, async ({ page }) => {
      const issues = watchIssues(page);
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);

      // 개발 모드(StrictMode)는 효과를 두 번 실행해 같은 요청이 2번 나가므로 중복은 하나로 본다.
      const distinct = [...new Set(issues.badResponses)];
      expect(distinct.filter((entry) => !allowed.includes(entry)), '기준선에 없던 4xx/5xx').toEqual([]);
      expect(issues.pageErrors, '처리 안 된 예외').toEqual([]);
      expect(issues.failedRequests, '실패한 요청').toEqual([]);
      // 콘솔 error 는 모두 위 401 이 남긴 "Failed to load resource" 여야 하고, 응답 수와 같아야 한다.
      expect(issues.consoleErrors.filter((text) => !/status of 401/.test(text)), '401 말고 다른 콘솔 error').toEqual([]);
      expect(issues.consoleErrors.length, '콘솔 error 수와 401 응답 수가 다르다').toBe(issues.badResponses.length);
    });
  }
});
