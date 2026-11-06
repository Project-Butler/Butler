import { defineConfig } from 'vitest/config';

// RTL 컴포넌트 테스트 설정. 앱 빌드 설정(vite.config.js, PWA 플러그인)과 분리해 둔다.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.{js,jsx}'],
  },
});
