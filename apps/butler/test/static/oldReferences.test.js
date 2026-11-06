// @vitest-environment node
// T0 정적 검사: 세 앱을 하나로 합친 뒤 옛 앱·PWA·설치 배너를 가리키는 곳이 저장소에 남아 있으면 실패한다.
// 추적 중인 파일(git ls-files)만 본다. docs/plan.md 는 옛 구조를 설명하는 이전 계획 문서라 제외한다.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter(Boolean)
  // docs/plan.md : 이전 구조를 설명하는 계획 문서.
  // oldReferences·chunks 테스트: "없어야 하는 것"의 이름을 적어 두고 없는지 확인하는 파일이라 검사 대상에서 뺀다.
  .filter((file) => !['docs/plan.md', 'apps/butler/test/static/oldReferences.test.js', 'apps/butler/test/static/chunks.test.js'].includes(file))
  .filter((file) => !/\.(png|jpg|jpeg|gif|ico|webp|woff2?|zip|xlsx?|pptx)$/i.test(file));

const read = (file) => readFileSync(path.join(repoRoot, file), 'utf8');

const findMatches = (pattern, { excludeFiles = [] } = {}) =>
  tracked
    .filter((file) => !excludeFiles.includes(file))
    .flatMap((file) =>
      read(file)
        .split(/\r?\n/)
        .map((line, index) => ({ file, line: index + 1, text: line.trim().slice(0, 120) }))
        .filter(({ text }) => pattern.test(text)),
    );

const show = (matches) => matches.map(({ file, line, text }) => `${file}:${line}  ${text}`).join('\n');

describe('T0 옛 경로·PWA 참조 0개', () => {
  it('apps/landlord · apps/admin · apps/tenant · @butler/landlord|admin|tenant 를 가리키는 곳이 없다', () => {
    const matches = findMatches(/apps\/(landlord|admin|tenant)\b|@butler\/(landlord|admin|tenant)\b|-w apps\/(landlord|admin|tenant)\b/);
    expect(matches, `옛 경로를 가리키는 곳:\n${show(matches)}`).toEqual([]);
  });

  it('옛 개발 포트(5174 임차인 · 5175 관리자)를 가리키는 곳이 없다', () => {
    const matches = findMatches(/\b517[45]\b/, { excludeFiles: ['package-lock.json'] });
    expect(matches, `옛 포트를 가리키는 곳:\n${show(matches)}`).toEqual([]);
  });

  it('PWA(vite-plugin-pwa · manifest · 서비스워커 · 설치 배너)가 없다', () => {
    const matches = findMatches(
      /vite-plugin-pwa|VitePWA|manifest\.json|rel="manifest"|registerSW|serviceWorker|InstallBanner|InstallNudge|IosInstallGuide|useInstallPrompt|beforeinstallprompt/,
      { excludeFiles: ['package-lock.json'] },
    );
    expect(matches, `PWA 흔적:\n${show(matches)}`).toEqual([]);
  });

  it('락파일에도 PWA 플러그인과 옛 워크스페이스가 남지 않았다', () => {
    const lock = JSON.parse(read('package-lock.json')).packages;
    const names = Object.keys(lock);
    expect(names.filter((name) => /vite-plugin-pwa|workbox-/.test(name))).toEqual([]);
    expect(names.filter((name) => /^apps\/(landlord|admin|tenant)$/.test(name))).toEqual([]);
    expect(names).toContain('apps/butler');
  });

  it('옛 앱 폴더에 추적 파일이 남아 있지 않다', () => {
    expect(tracked.filter((file) => /^apps\/(landlord|admin|tenant)\//.test(file))).toEqual([]);
  });

  it('.env 는 추적되지 않고 .env.example 만 있다', () => {
    const envFiles = tracked.filter((file) => /(^|\/)\.env(\.|$)/.test(file));
    expect(envFiles.filter((file) => !file.endsWith('.env.example'))).toEqual([]);
    expect(envFiles).toContain('apps/butler/.env.example');
  });
});
