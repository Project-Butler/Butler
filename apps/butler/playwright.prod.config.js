import { defineConfig, devices } from '@playwright/test';

// 배포 빌드(vite build → vite preview)를 대상으로 하는 E2E. 개발 서버에서만 동작하는 기능(?surface= 덮어쓰기)이
// 배포 빌드에서는 무시되는지 확인한다. 같은 포트 5173 을 쓰므로(API 의 FRONTEND_ORIGINS 가 5173 하나다)
// 개발 서버(npm run dev)를 끄고 실행한다. 전제는 playwright.config.js 와 같다.
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.prod.spec.js',
  globalSetup: './test/e2e/global-setup.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  outputDir: './test-results-prod',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    locale: 'ko-KR',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 5173 --strictPort',
    url: 'http://localhost:5173',
    // 개발 서버가 이미 떠 있으면 배포 빌드가 아니라 개발 서버를 검증하게 되므로 재사용하지 않는다.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
