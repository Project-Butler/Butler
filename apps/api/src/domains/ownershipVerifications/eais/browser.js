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
];

// 세움터 보안 프로그램(KCase)은 PC에 설치된 프로그램과 localhost로 통신한다. Chrome은 이때 왼쪽 위에
// 「로컬 네트워크 기기 접근」 허용 창을 띄우는데(「허용」을 누르면 「보안프로그램 로딩중」이 사라짐, 2026-10-20 확인),
// 이 창은 브라우저 UI라 페이지 안에서 누를 수 없다 → 사람이 누를 「허용」과 같은 권한을 세움터에만 미리 준다.
// 권한 이름은 Chrome 판마다 바뀌어(local-network-access → local-network / loopback-network) 받아 주는 이름만 남긴다.
const LOCAL_NETWORK_ORIGIN = 'https://www.eais.go.kr';
const LOCAL_NETWORK_PERMISSIONS = ['local-network-access', 'local-network', 'loopback-network'];

// { browser, page, headless, close() }를 돌려준다. 오류가 나도 반드시 close()를 불러야 node가 끝난다
export const openSession = async ({ headless }) => {
  const executablePath = CHROME_CANDIDATES.find((p) => !!p && existsSync(p));
  if (!executablePath) throw new Error('Chrome 실행 파일을 찾지 못했습니다(C:/Program Files/Google/Chrome 에 설치돼 있어야 합니다).');
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'butler-eais-'));
  const browser = await puppeteer.launch({
    executablePath,
    userDataDir,
    headless,
    defaultViewport: { width: 1280, height: 900 },
    args: ['--lang=ko-KR', '--no-first-run', '--no-default-browser-check'],
  });
  const page = (await browser.pages())[0] ?? (await browser.newPage());

  const granted = [];
  for (const name of LOCAL_NETWORK_PERMISSIONS) {
    await browser
      .defaultBrowserContext()
      .setPermission(LOCAL_NETWORK_ORIGIN, { permission: { name }, state: 'granted' })
      .then(() => granted.push(name))
      .catch(() => undefined);
  }
  console.info(`[eais] 로컬 네트워크 권한: ${granted.length ? granted.join(', ') : '받아 주는 이름 없음 — 허용 창이 뜨면 사람이 누름'}`);

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
