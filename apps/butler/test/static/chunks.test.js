// @vitest-environment node
// T0 정적 검사: admin · landlord(web/app) · tenant 청크가 따로 나뉘어야 한다 (docs/plan.md 8장 "임차인이 관리자 코드까지 내려받음").
// 실제로 vite build 를 돌려, 역할마다 고유한 문구가 "자기 청크에만" 있고 첫 진입 청크에는 없는지 본다.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// 역할 화면에만 있는 문구. 값을 바꾸면 이 테스트도 같이 고친다.
const MARKERS = {
  admin: '관리자 콘솔', // admin/layout/AdminLayout.jsx 의 brandSubtitle
  landlordWeb: '버틀러의 자산', // landlord/web/layout/LandlordLayout.jsx 의 brandSubtitle
  landlordApp: 'landlord-app', // landlord/app 셸의 data-shell
  tenant: 'data-shell', // tenant 셸의 data-shell (tenant 안에서만 'tenant' 값을 쓴다 — 아래에서 값까지 본다)
};
const TENANT_MARKER = '"tenant"';

let outDir;
let files;
let entryName;

beforeAll(async () => {
  outDir = mkdtempSync(path.join(os.tmpdir(), 'butler-chunks-'));
  await build({ root: appRoot, configFile: path.join(appRoot, 'vite.config.js'), logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  const assets = path.join(outDir, 'assets');
  files = Object.fromEntries(readdirSync(assets).filter((name) => name.endsWith('.js')).map((name) => [name, readFileSync(path.join(assets, name), 'utf8')]));
  const html = readFileSync(path.join(outDir, 'index.html'), 'utf8');
  entryName = html.match(/assets\/([^"]+\.js)"/)?.[1];
}, 180000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

const chunksContaining = (text) => Object.entries(files).filter(([, code]) => code.includes(text)).map(([name]) => name);

describe('T0 역할별 청크 분리 (빌드 결과)', () => {
  it('첫 진입 청크(index.html 이 부르는 파일)를 찾았다', () => {
    expect(entryName, 'index.html 에서 진입 스크립트를 못 찾았다').toBeTruthy();
    expect(files[entryName]).toBeTruthy();
  });

  it.each([
    ['관리자', MARKERS.admin],
    ['임대인 웹', MARKERS.landlordWeb],
  ])('%s 화면 문구(%s)는 정확히 한 청크에만 있고, 첫 진입 청크에는 없다', (_name, marker) => {
    const holders = chunksContaining(marker);
    expect(holders, `"${marker}" 가 들어 있는 청크`).toHaveLength(1);
    expect(holders[0], `"${marker}" 가 첫 진입 청크에 들어 있다 — 역할 화면이 코드 분할되지 않았다`).not.toBe(entryName);
  });

  it('임대인 앱 · 임차인 화면도 첫 진입 청크에 들어 있지 않다', () => {
    expect(files[entryName]).not.toContain(MARKERS.landlordApp);
    expect(files[entryName]).not.toContain(TENANT_MARKER);
    expect(chunksContaining(MARKERS.landlordApp)).not.toContain(entryName);
  });

  it('관리자 · 임대인 웹 · 임대인 앱 · 임차인 청크는 서로 다른 파일이다', () => {
    const picked = {
      admin: chunksContaining(MARKERS.admin)[0],
      landlordWeb: chunksContaining(MARKERS.landlordWeb)[0],
      landlordApp: chunksContaining(MARKERS.landlordApp)[0],
      tenant: chunksContaining(TENANT_MARKER).find((name) => files[name].includes(MARKERS.tenant)),
    };
    for (const [role, name] of Object.entries(picked)) expect(name, `${role} 청크를 못 찾았다`).toBeTruthy();
    expect(new Set(Object.values(picked)).size, `서로 다른 청크여야 하는데 겹친다: ${JSON.stringify(picked)}`).toBe(4);
  });

  it('한 역할 청크에 다른 역할의 고유 문구가 섞이지 않는다', () => {
    const admin = chunksContaining(MARKERS.admin)[0];
    const landlordWeb = chunksContaining(MARKERS.landlordWeb)[0];
    expect(files[admin]).not.toContain(MARKERS.landlordWeb);
    expect(files[landlordWeb]).not.toContain(MARKERS.admin);
  });

  it('PWA 산출물(sw.js · workbox · registerSW)이 빌드 결과에 없다', () => {
    const all = readdirSync(outDir, { recursive: true }).map(String);
    expect(all.filter((name) => /(^|[\\/])sw\.js$|workbox|registerSW|manifest/.test(name))).toEqual([]);
  });
});
