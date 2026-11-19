import { defineConfig } from 'vitest/config';

// RTL 컴포넌트 테스트 설정. 앱 빌드 설정(vite.config.js)과 분리해 둔다.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  // vite 6 부터 작은 SVG 를 data URI 로 인라인한다. 아이콘 테스트가 파일 이름(tab-home-off 등)으로 확인하므로 끈다.
  build: { assetsInlineLimit: 0 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.{js,jsx}'],
  },
});
