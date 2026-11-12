// @vitest-environment node
// 디자인 토큰이 Figma Foundations 와 맞는지 (Figma Foundations와 비교해 없는 토큰만 추가, 기존 값은 덮어쓰지 않음).
// Figma 쪽 값은 get_variable_defs 로 읽은 정의를 옮긴 스냅샷이다.
//   파일: Butler 화면 구조 · IA · 와이어프레임 (fileKey ttUBxWD5lrOZJlHXZbxM6D) › 01 Foundations (node 2:164), 2026-11-06 확인
import tailwindConfig from '@butler/config/tailwind.config.js';
import { describe, expect, it } from 'vitest';

const FIGMA_COLORS = {
  accent: '#0e6b5c', accentStrong: '#0a5246', accentSoft: '#ddefea',
  seal: '#34479e', sealInk: '#2b3b85', sealSoft: '#e4e8f7', sealBox: '#f6f7fd',
  ink: '#15201c', ink2: '#4b5a55', ink3: '#5a6863',
  ok: '#1e7f4e', okInk: '#17643d', okSoft: '#ddf1e5',
  warn: '#a0600c', warnInk: '#85500a', warnSoft: '#fbebd2',
  crit: '#b83a28', critInk: '#9c3020', critSoft: '#f8e0db', critBox: '#fdf3f1',
  ground: '#eef1f0', surface: '#ffffff', surface2: '#f3f6f5', line: '#dce3e0', dash: '#b9c4c0', slot: '#9aa8a3',
};
// Figma 색 이름 → tailwind theme.extend.colors 안의 경로
const COLOR_PATH = {
  accent: ['accent', 'DEFAULT'], accentStrong: ['accent', 'strong'], accentSoft: ['accent', 'soft'],
  seal: ['seal', 'DEFAULT'], sealInk: ['seal', 'ink'], sealSoft: ['seal', 'soft'], sealBox: ['seal', 'box'],
  ink: ['ink', 'DEFAULT'], ink2: ['ink', '2'], ink3: ['ink', '3'],
  ok: ['ok', 'DEFAULT'], okInk: ['ok', 'ink'], okSoft: ['ok', 'soft'],
  warn: ['warn', 'DEFAULT'], warnInk: ['warn', 'ink'], warnSoft: ['warn', 'soft'],
  crit: ['crit', 'DEFAULT'], critInk: ['crit', 'ink'], critSoft: ['crit', 'soft'], critBox: ['crit', 'box'],
  ground: ['ground'], surface: ['surface'], surface2: ['surface-2'], line: ['line'], dash: ['dash'], slot: ['slot'],
};

// 글자 단계: [크기 px, 줄 높이, 자간 %]. 굵기는 클래스(font-medium·font-semibold…)로 따로 정한다.
const FIGMA_TEXT = {
  display: [32, 1.3, -2], page: [28, 1.3, -2], 'page-sm': [24, 1.3, -2], h1: [22, 1.5, 0], section: [18, 1.5, 0],
  card: [16, 1.5, 0], 'card-sm': [15, 1.5, 0], body: [14, 1.5, 0], 'body-m': [14, 1.5, 0], label: [13, 1.5, 0],
  sub: [12.5, 1.5, 0], chip: [12, 1.5, 0], eyebrow: [11.5, 1.5, 6], tab: [11, 1.5, 0], 'tab-on': [11, 1.5, 0],
  btn: [15, 1.5, 0], 'btn-sm': [14, 1.5, 0],
  'num/kpi': [28, 1.3, -1], 'num/lg': [20, 1.3, -1], 'num/body': [14, 1.3, 0], 'num/sub': [12.5, 1.3, 0], 'num/chip': [12, 1.3, 0],
};
// Figma 글자 이름 → tailwind fontSize 키. 크기가 같고 굵기·줄 높이만 다른 것은 같은 키를 쓴다.
const SIZE_KEY = {
  display: 'display', page: 'page', 'page-sm': 'page-sm', h1: 'h1', section: 'section', card: 'card', 'card-sm': 'card-sm',
  body: 'body', 'body-m': 'body', label: 'label', sub: 'sub', chip: 'chip', eyebrow: 'eyebrow', tab: 'tab', 'tab-on': 'tab',
  btn: 'btn', 'btn-sm': 'btn-sm', 'num/kpi': 'kpi', 'num/lg': 'num-lg', 'num/body': 'body', 'num/sub': 'sub', 'num/chip': 'chip',
};
// 이번에 Figma 에 맞춰 새로 넣은 글자 키: 줄 높이·자간까지 Figma 값을 따른다.
// #98: 기존 키(h1·card·label·sub·chip·kpi)는 줄 높이가 Figma 와 달라 웹 화면을 지키려고 덮어쓰지 않았다. 앱(모바일) 화면은 아래 새 키로 Figma 값을 그대로 쓴다.
//   m-* = 같은 크기에 줄 높이 1.5(Figma). num-* = 숫자 글꼴 단계(줄 높이 1.3).
const ADDED_SIZE_KEYS = {
  'card-sm': 'card-sm', tab: 'tab', btn: 'btn', 'btn-sm': 'btn-sm', 'num-lg': 'num/lg',
  'm-h1': 'h1', 'm-card': 'card', 'm-label': 'label', 'm-sub': 'sub', 'm-chip': 'chip',
  'num-kpi': 'num/kpi', 'num-body': 'num/body', 'num-sub': 'num/sub',
};

const extend = tailwindConfig.theme.extend;
const pick = (object, path) => path.reduce((value, key) => value?.[key], object);
const sizeOf = (key) => {
  const [size, options] = Array.isArray(extend.fontSize[key]) ? extend.fontSize[key] : [extend.fontSize[key], {}];
  return { size: Number.parseFloat(size), lineHeight: Number.parseFloat(options?.lineHeight), letterSpacing: options?.letterSpacing };
};

describe('색 토큰이 Figma Foundations 와 같다', () => {
  it('Figma 색 이름마다 tailwind 경로 매핑이 있다 (새 색을 스냅샷에 넣고 매핑을 빼먹지 않게)', () => {
    expect(Object.keys(COLOR_PATH).sort()).toEqual(Object.keys(FIGMA_COLORS).sort());
  });

  it.each(Object.entries(FIGMA_COLORS))('%s = %s', (name, hex) => {
    const actual = pick(extend.colors, COLOR_PATH[name]);
    expect(actual, `theme.extend.colors.${COLOR_PATH[name].join('.')} 가 없다`).toBeDefined();
    expect(String(actual).toLowerCase()).toBe(hex);
  });
});

describe('글자 크기 토큰이 Figma Foundations 와 같다', () => {
  it('Figma 글자 이름마다 tailwind 키 매핑이 있다', () => {
    expect(Object.keys(SIZE_KEY).sort()).toEqual(Object.keys(FIGMA_TEXT).sort());
  });

  it.each(Object.entries(FIGMA_TEXT))('%s: 크기가 같다', (name, [size]) => {
    const key = SIZE_KEY[name];
    expect(extend.fontSize[key], `theme.extend.fontSize['${key}'] 가 없다`).toBeDefined();
    expect(sizeOf(key).size).toBe(size);
  });

  it.each(Object.entries(ADDED_SIZE_KEYS))('새로 넣은 %s 는 줄 높이·자간도 Figma(%s)와 같다', (key, figmaName) => {
    const [, lineHeight, letterSpacingPercent] = FIGMA_TEXT[figmaName];
    const actual = sizeOf(key);
    expect(actual.lineHeight).toBe(lineHeight);
    if (letterSpacingPercent !== 0) expect(actual.letterSpacing).toBe(`${letterSpacingPercent / 100}em`);
  });
});

describe('#97: 이미 있던 토큰 값은 덮어쓰지 않는다', () => {
  it('기존 색 22개 값이 그대로다', () => {
    const existing = {
      accent: { DEFAULT: '#0E6B5C', strong: '#0A5246', soft: '#DDEFEA' },
      seal: { DEFAULT: '#34479E', ink: '#2B3B85', soft: '#E4E8F7' },
      ink: { DEFAULT: '#15201C', 2: '#4B5A55', 3: '#5A6863' },
      ok: { DEFAULT: '#1E7F4E', ink: '#17643D', soft: '#DDF1E5' },
      warn: { DEFAULT: '#A0600C', ink: '#85500A', soft: '#FBEBD2' },
      crit: { DEFAULT: '#B83A28', ink: '#9C3020', soft: '#F8E0DB' },
      ground: '#EEF1F0', surface: '#FFFFFF', 'surface-2': '#F3F6F5', line: '#DCE3E0',
    };
    for (const [name, value] of Object.entries(existing)) {
      if (typeof value === 'string') expect(extend.colors[name], name).toBe(value);
      else for (const [shade, hex] of Object.entries(value)) expect(extend.colors[name][shade], `${name}.${shade}`).toBe(hex);
    }
  });

  it('기존 글자 단계의 크기·줄 높이·자간이 그대로다 (Figma 와 줄 높이가 다른 곳도 일부러 두었다)', () => {
    const existing = {
      display: ['32px', '1.25', '-0.02em'], page: ['28px', '1.3', '-0.02em'], 'page-sm': ['24px', '1.3', '-0.02em'],
      h1: ['22px', '1.35'], section: ['18px', '1.4'], card: ['16px', '1.4'], body: ['14px', '1.5'], label: ['13px', '1.4'],
      sub: ['12.5px', '1.4'], chip: ['12px', '1.3'], eyebrow: ['11.5px', '1.3', '0.06em'], kpi: ['28px', '1.1', '-0.01em'],
    };
    for (const [key, [size, lineHeight, letterSpacing]] of Object.entries(existing)) {
      const [actualSize, options] = extend.fontSize[key];
      expect(actualSize, `${key} 크기`).toBe(size);
      expect(options.lineHeight, `${key} 줄 높이`).toBe(lineHeight);
      expect(options.letterSpacing, `${key} 자간`).toBe(letterSpacing);
    }
  });
});
