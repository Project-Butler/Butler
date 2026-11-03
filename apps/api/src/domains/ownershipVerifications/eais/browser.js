// Created: 2026-10-21 04:31
// 브라우저 열기/닫기. 원본: eais-ledger src/browser.ts
// 매 실행마다 새 임시 프로필(userDataDir)을 쓰고 닫을 때 지운다. 쿠키·세션을 저장하거나 재사용하지 않는다.
// Chrome은 PC 설치본(puppeteer-core)이다.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

// 사람 입력 대기를 제외한 단계당 시간 초과
export const STEP_TIMEOUT_MS = 30_000;

// Chrome 기본 설치 위치
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

// 세움터 보안 프로그램(KCase)은 PC에 설치된 프로그램과 localhost로 통신한다. 아이디 로그인·발급에는 KCase가 필요 없고,
// 닿지 못하면 「인증서 관리 모듈이 설치되지 않았습니다」 알림만 뜨고 진행된다(Linux headless 발급 성공, Windows 로그인 확인 2026-11-03).
// 반대로 KCase가 설치됐지만 응답이 비면 「보안프로그램 로딩중」 덮개가 사라지지 않아 멈춘다(Azure Windows VM, 2026-11-03).
// 그래서 세움터의 로컬 네트워크 접근을 막아 어느 PC에서든 KCase 없이 같은 경로로 돌게 한다.
// 권한 이름은 Chrome 판마다 바뀌어(local-network-access → local-network / loopback-network) 받아 주는 이름만 남긴다.
const LOCAL_NETWORK_ORIGIN = 'https://www.eais.go.kr';
const LOCAL_NETWORK_PERMISSIONS = ['local-network-access', 'local-network', 'loopback-network'];

// { browser, page, headless, close() }를 돌려준다. 오류가 나도 반드시 close()를 불러야 node가 끝난다
export const openSession = async ({ headless }) => {
  const executablePath = CHROME_CANDIDATES.find((p) => !!p && existsSync(p));
  if (!executablePath) throw new Error('Chrome 실행 파일을 찾지 못했습니다(C:/Program Files/Google/Chrome 에 설치돼 있어야 합니다. Linux는 /usr/bin/google-chrome, Mac은 /Applications/Google Chrome.app).');
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'butler-eais-'));
  const browser = await puppeteer.launch({
    executablePath,
    userDataDir,
    headless,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--lang=ko-KR', '--no-first-run', '--no-default-browser-check'],
  });
  const page = (await browser.pages())[0] ?? (await browser.newPage());

  const denied = [];
  for (const name of LOCAL_NETWORK_PERMISSIONS) {
    await browser
      .defaultBrowserContext()
      .setPermission(LOCAL_NETWORK_ORIGIN, { permission: { name }, state: 'denied' })
      .then(() => denied.push(name))
      .catch(() => undefined);
  }
  console.info(`[eais] 로컬 네트워크 접근 차단(KCase 미사용): ${denied.length ? denied.join(', ') : '받아 주는 이름 없음'}`);

  page.setDefaultTimeout(STEP_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(STEP_TIMEOUT_MS);
  let closed = false;
  return {
    browser,
    page,
    headless,
    async close() {
      if (closed) return;
      closed = true;
      await browser.close().catch(() => undefined);
      // Chrome이 프로필 파일을 늦게 놓는 경우가 있어 몇 번 재시도
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(userDataDir, { recursive: true, force: true });
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      console.warn(`[eais] 임시 프로필 삭제 실패: ${userDataDir}`);
    },
  };
};
