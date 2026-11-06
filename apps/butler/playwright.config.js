import { defineConfig, devices } from '@playwright/test';

// E2E (docs/plan.md 7장). 전제: Docker Postgres 와 API(http://localhost:4000)가 떠 있고 seed 계정이 있다
// (landlord · tenant · admin @butler.test / password123 — `prisma db seed` 가 만든다). 앱(5173)은 없으면 여기서 띄운다.
// 실행: npm run test:e2e -w apps/butler      배포 빌드 검증: npm run test:e2e:prod -w apps/butler
//
// 로그인은 이메일당 10분에 10회로 제한된다(API loginRateLimiter). 그래서 세션은 globalSetup 이 역할마다 한 번만 만들어
// storageState 로 나눠 쓰고, 세션을 망가뜨리는 테스트(로그아웃 등)만 자기 로그인을 한다. 스위트는 15분 안에 끝나야 한다(액세스 토큰 만료).
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.js',
  // 배포 빌드(vite preview)를 대상으로 하는 스펙은 playwright.prod.config.js 가 따로 돌린다.
  testIgnore: '**/*.prod.spec.js',
  globalSetup: './test/e2e/global-setup.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    locale: 'ko-KR',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
