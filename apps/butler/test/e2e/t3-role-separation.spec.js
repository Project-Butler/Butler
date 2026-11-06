// T3 역할 분리 (docs/plan.md 7장)
//   성공: 다른 역할 주소로 가면 내 역할 홈으로 간다. 그 사이 다른 역할의 API 요청과 청크 로드가 0건.  실패: 1건이라도 있음.
// 개발 서버에서는 청크가 모듈 요청(/src/<역할>/…)으로 보인다. 배포 빌드의 청크 분리는 test/static/chunks.test.js 가 본다.
import { expect, test } from '@playwright/test';
import { ACCOUNTS, adminApiRequests, roleModuleRequests, statePath, watchRequests } from './helpers.js';

// [로그인 역할, 들어간 주소, 가야 할 홈, 요청이 없어야 하는 다른 역할 폴더들]
const CASES = [
  ['landlord', '/admin/users', ACCOUNTS.landlord.home, ['admin', 'tenant']],
  ['landlord', '/tenant/home', ACCOUNTS.landlord.home, ['admin', 'tenant']],
  ['tenant', '/admin/users', ACCOUNTS.tenant.home, ['admin', 'landlord']],
  ['tenant', '/landlord/home', ACCOUNTS.tenant.home, ['admin', 'landlord']],
  ['admin', '/landlord/home', ACCOUNTS.admin.home, ['landlord', 'tenant']],
  ['admin', '/tenant/home', ACCOUNTS.admin.home, ['landlord', 'tenant']],
];

for (const role of ['landlord', 'tenant', 'admin']) {
  test.describe(`T3 ${role} 로 로그인한 상태`, () => {
    test.use({ storageState: statePath(role) });

    for (const [caseRole, path, home, forbidden] of CASES.filter(([r]) => r === role)) {
      test(`${path} → ${home}. ${forbidden.join('·')} 화면 모듈과 관리자 API 요청이 0건`, async ({ page }) => {
        const urls = watchRequests(page);

        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${home.replaceAll('/', '\\/')}$`));
        await page.waitForLoadState('networkidle');

        for (const folder of forbidden) {
          expect(roleModuleRequests(urls, folder), `${caseRole} 가 ${folder} 화면 모듈을 내려받았다`).toEqual([]);
        }
        if (caseRole !== 'admin') expect(adminApiRequests(urls), '관리자 API 를 불렀다').toEqual([]);
      });
    }
  });
}

// 양성 대조: 검사가 항상 비어 있는 허수가 아니다 — 자기 역할 화면은 실제로 모듈 요청이 보인다.
test.describe('T3 양성 대조', () => {
  test.use({ storageState: statePath('admin') });

  test('관리자가 /admin/dashboard 를 열면 admin 모듈과 관리자 API 요청이 실제로 관측된다', async ({ page }) => {
    const urls = watchRequests(page);
    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');
    expect(roleModuleRequests(urls, 'admin').length).toBeGreaterThan(0);
    expect(adminApiRequests(urls).length).toBeGreaterThan(0);
  });
});
