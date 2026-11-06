// @vitest-environment node
// 화면 형태(web · app) 판단 기준:
//   휴대폰 UA이거나, 터치 기기((pointer: coarse))이면서 폭이 768px 미만이면 앱, 아니면 웹. 폭은 단독 기준이 아니다.
//   UA는 navigator.userAgentData.mobile 을 먼저 보고, 없는 브라우저만 navigator.userAgent 의 휴대폰 단어로 본다.
//   페이지를 열 때 한 번 판단하고 저장하지 않는다. ?surface= 덮어쓰기는 개발 환경에서만 동작한다.
// 아래 환경 값은 실제 브라우저(Chromium 153)에서 http://localhost 로 열어 읽은 값에 맞췄다(userAgentData.mobile · pointer: coarse · innerWidth).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { APP_MAX_WIDTH, createGetSurface, detectSurface, readSurfaceOverride } from '../../src/surface/getSurface';

const UA = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  // iPadOS Safari는 UA가 Mac이고 userAgentData가 없다
  iPadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};

describe('detectSurface: 휴대폰 UA', () => {
  it('userAgentData.mobile 이 true 면 앱 (Chromium의 iPhone·Pixel)', () => {
    expect(detectSurface({ userAgentData: { mobile: true }, userAgent: UA.androidPhone, isCoarsePointer: true, width: 412 })).toBe('app');
  });

  it('userAgentData 가 없는 브라우저는 UA 문자열로 본다: iPhone Safari → 앱', () => {
    expect(detectSurface({ userAgentData: undefined, userAgent: UA.iPhone, isCoarsePointer: true, width: 390 })).toBe('app');
  });

  it('userAgentData 가 없는 브라우저: Android + Mobile → 앱', () => {
    expect(detectSurface({ userAgentData: undefined, userAgent: UA.androidPhone, isCoarsePointer: true, width: 412 })).toBe('app');
  });

  it('휴대폰 UA 이면 폭이 넓어도 앱이다 (가로로 돌린 휴대폰)', () => {
    expect(detectSurface({ userAgentData: { mobile: true }, userAgent: UA.iPhone, isCoarsePointer: true, width: 844 })).toBe('app');
  });

  it('userAgentData 가 있으면 그 값을 따른다: mobile=false 인 데스크톱 Chromium 은 UA 문자열을 보지 않는다', () => {
    // 같은 UA 문자열이 iPhone 이어도 userAgentData(false)가 먼저다. 실제 브라우저에서는 둘이 어긋나지 않는다.
    expect(detectSurface({ userAgentData: { mobile: false }, userAgent: UA.iPhone, isCoarsePointer: false, width: 1280 })).toBe('web');
  });
});

describe('detectSurface: 폭은 단독 기준이 아니다', () => {
  it('PC(마우스)에서 창을 아무리 줄여도 웹이다', () => {
    for (const width of [1280, 767, 500, 320]) {
      expect(detectSurface({ userAgentData: { mobile: false }, userAgent: UA.desktop, isCoarsePointer: false, width })).toBe('web');
    }
  });

  it('터치 기기 + 데스크톱 UA: 폭이 768 미만이면 앱, 768 이상이면 웹 (경계값 767 / 768)', () => {
    const touchDesktop = { userAgentData: { mobile: false }, userAgent: UA.desktop, isCoarsePointer: true };
    expect(detectSurface({ ...touchDesktop, width: APP_MAX_WIDTH - 1 })).toBe('app');
    expect(detectSurface({ ...touchDesktop, width: APP_MAX_WIDTH })).toBe('web');
    expect(detectSurface({ ...touchDesktop, width: 800 })).toBe('web');
  });

  it('APP_MAX_WIDTH 는 768', () => {
    expect(APP_MAX_WIDTH).toBe(768);
  });

  it('Android 태블릿(UA에 Mobile 없음, mobile=false): 768 이상이면 웹, 미만이면 앱', () => {
    const tablet = { userAgentData: { mobile: false }, userAgent: UA.androidTablet, isCoarsePointer: true };
    expect(detectSurface({ ...tablet, width: 800 })).toBe('web');
    expect(detectSurface({ ...tablet, width: 600 })).toBe('app');
  });

  it('iPadOS Safari(UA가 Mac, userAgentData 없음): 터치 기준으로 768 미만만 앱', () => {
    const ipad = { userAgentData: undefined, userAgent: UA.iPadSafari, isCoarsePointer: true };
    expect(detectSurface({ ...ipad, width: 744 })).toBe('app');
    expect(detectSurface({ ...ipad, width: 820 })).toBe('web');
  });

  it('값이 하나도 없으면 웹이다 (SSR·테스트 환경)', () => {
    expect(detectSurface()).toBe('web');
  });
});

describe('readSurfaceOverride: ?surface= 는 개발 환경에서만', () => {
  it.each([
    ['?surface=app', true, 'app'],
    ['?surface=web', true, 'web'],
    ['?a=1&surface=app', true, 'app'],
    ['?surface=app', false, null],
    ['?surface=web', false, null],
    ['?surface=tablet', true, null],
    ['?surface=', true, null],
    ['', true, null],
  ])('search=%j isDev=%s → %s', (search, isDev, expected) => {
    expect(readSurfaceOverride(search, isDev)).toBe(expected);
  });
});

describe('createGetSurface: 페이지를 열 때 한 번만 판단한다', () => {
  const desktop = { userAgentData: { mobile: false }, userAgent: UA.desktop, isCoarsePointer: false, width: 1280, search: '', isDev: false };

  it('처음 읽은 환경으로 정하고, 이후 창 크기·기기가 바뀌어도 다시 판단하지 않는다', () => {
    let env = desktop;
    const getSurface = createGetSurface(() => env);
    expect(getSurface()).toBe('web');
    env = { ...desktop, userAgentData: { mobile: true }, width: 390, isCoarsePointer: true };
    expect(getSurface()).toBe('web');
  });

  it('환경은 한 번만 읽는다', () => {
    const readEnv = vi.fn(() => desktop);
    const getSurface = createGetSurface(readEnv);
    getSurface();
    getSurface();
    getSurface();
    expect(readEnv).toHaveBeenCalledTimes(1);
  });

  it('두 번째 페이지 열기(새 판단)는 이전 결과를 물려받지 않는다: 휴대폰으로 연 뒤 PC로 열면 웹', () => {
    const phone = createGetSurface(() => ({ ...desktop, userAgentData: { mobile: true }, isCoarsePointer: true, width: 390 }));
    expect(phone()).toBe('app');
    const pc = createGetSurface(() => desktop);
    expect(pc()).toBe('web');
  });

  it('개발 환경에서는 ?surface= 가 판단보다 우선한다', () => {
    expect(createGetSurface(() => ({ ...desktop, search: '?surface=app', isDev: true }))()).toBe('app');
  });

  it('배포 빌드(isDev=false)에서는 ?surface= 를 무시한다', () => {
    expect(createGetSurface(() => ({ ...desktop, search: '?surface=app', isDev: false }))()).toBe('web');
  });
});

describe('저장하지 않는다 (쿠키·localStorage 금지)', () => {
  it('surface 모듈 소스에 저장소 접근이 없다', () => {
    const source = readFileSync(new URL('../../src/surface/getSurface.js', import.meta.url), 'utf8');
    // 주석 속 설명 문구는 제외하고 코드만 본다.
    const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB|caches\./);
  });
});
