// 임대인 웹 화면 설정(#176). 고르면 미리 적용되고 저장해야 남는지, 잘못 저장된 값·localStorage 실패에도 기본 화면으로 동작하는지,
// <html>에 값이 붙고 걷히는지 고정한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'butler.landlord.display';
const DEFAULTS = { theme: 'system', density: 'default', sidebar: 'expanded', fontSize: 'default' };

// 저장소가 모듈 안에 값을 캐시하므로 테스트마다 새로 불러온다.
const loadModule = async () => {
  vi.resetModules();
  return import('../../../../src/landlord/web/utils/displaySettings');
};

const stubSystemDark = (matches) => {
  const listeners = new Set();
  window.matchMedia = vi.fn(() => ({
    matches,
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
  }));
  return listeners;
};

const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY));

beforeEach(() => {
  window.localStorage.clear();
  stubSystemDark(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-density');
  document.documentElement.style.removeProperty('--font-scale');
});

describe('저장된 설정 읽기', () => {
  it('저장된 값이 없으면 기본값이다', async () => {
    const { getSettings } = await loadModule();
    expect(getSettings()).toEqual(DEFAULTS);
  });

  it('저장된 값을 읽는다', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', density: 'compact', sidebar: 'auto', fontSize: 'large' }));
    const { getSettings } = await loadModule();
    expect(getSettings()).toEqual({ theme: 'dark', density: 'compact', sidebar: 'auto', fontSize: 'large' });
  });

  it('옵션에 없는 값은 그 항목만 기본값으로 되돌린다', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'neon', density: 'compact', sidebar: 7, fontSize: 'large' }));
    const { getSettings } = await loadModule();
    expect(getSettings()).toEqual({ theme: 'system', density: 'compact', sidebar: 'expanded', fontSize: 'large' });
  });

  it.each([['깨진 JSON', '{theme:'], ['객체가 아닌 값', '"dark"'], ['null', 'null']])('%s 이면 기본값이다', async (_, raw) => {
    window.localStorage.setItem(STORAGE_KEY, raw);
    const { getSettings } = await loadModule();
    expect(getSettings()).toEqual(DEFAULTS);
  });

  it('localStorage 를 읽을 수 없어도 기본값으로 동작한다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { getSettings } = await loadModule();
    expect(getSettings()).toEqual(DEFAULTS);
  });

  it('바뀌지 않으면 같은 객체를 돌려준다 (useSyncExternalStore 가 무한 갱신하지 않게)', async () => {
    const { getSettings, getSavedSettings } = await loadModule();
    expect(getSettings()).toBe(getSettings());
    expect(getSavedSettings()).toBe(getSavedSettings());
  });
});

describe('고르기(미리 적용)', () => {
  it('고른 값이 바로 적용되지만 저장은 되지 않는다', async () => {
    const { getSavedSettings, getSettings, previewSettings } = await loadModule();
    previewSettings({ theme: 'dark' });

    expect(getSettings().theme).toBe('dark');
    expect(getSavedSettings().theme).toBe('system');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('고를 때마다 구독자에게 알린다', async () => {
    const { previewSettings, subscribeSettings } = await loadModule();
    const listener = vi.fn();
    subscribeSettings(listener);
    previewSettings({ theme: 'dark' });
    previewSettings({ density: 'compact' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('일부만 바꿔도 나머지는 유지한다', async () => {
    const { getSettings, previewSettings } = await loadModule();
    previewSettings({ density: 'compact' });
    previewSettings({ fontSize: 'xlarge' });
    expect(getSettings()).toEqual({ ...DEFAULTS, density: 'compact', fontSize: 'xlarge' });
  });

  it('옵션에 없는 값은 기본값으로 막는다', async () => {
    const { getSettings, previewSettings } = await loadModule();
    previewSettings({ sidebar: 'hidden' });
    expect(getSettings().sidebar).toBe('expanded');
  });

  it('저장된 값과 같아지면 저장할 변경이 없는 상태로 돌아온다', async () => {
    const { getSavedSettings, getSettings, previewSettings } = await loadModule();
    previewSettings({ theme: 'dark' });
    expect(getSettings()).not.toBe(getSavedSettings());
    previewSettings({ theme: 'system' });
    expect(getSettings()).toBe(getSavedSettings());
  });

  it('구독을 풀면 더는 알리지 않는다', async () => {
    const { previewSettings, subscribeSettings } = await loadModule();
    const listener = vi.fn();
    const unsubscribe = subscribeSettings(listener);
    unsubscribe();
    previewSettings({ theme: 'light' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('기본값으로 미리 적용한다 (저장해야 남는다)', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', density: 'compact', sidebar: 'collapsed', fontSize: 'large' }));
    const { getSavedSettings, getSettings, resetSettings } = await loadModule();
    resetSettings();
    expect(getSettings()).toEqual(DEFAULTS);
    expect(getSavedSettings().theme).toBe('dark');
    expect(stored().theme).toBe('dark');
  });
});

describe('저장', () => {
  it('저장하면 웹을 다시 열어도(모듈을 새로 불러와도) 그 값이다', async () => {
    const first = await loadModule();
    first.previewSettings({ theme: 'dark', density: 'compact', sidebar: 'auto', fontSize: 'large' });
    first.saveSettings();

    expect(stored()).toEqual({ theme: 'dark', density: 'compact', sidebar: 'auto', fontSize: 'large' });

    const reopened = await loadModule();
    expect(reopened.getSettings()).toEqual({ theme: 'dark', density: 'compact', sidebar: 'auto', fontSize: 'large' });
    expect(reopened.getSavedSettings()).toBe(reopened.getSettings());
  });

  it('저장하면 고르는 중인 상태가 끝나 저장된 값과 같은 객체가 된다', async () => {
    const { getSavedSettings, getSettings, previewSettings, saveSettings } = await loadModule();
    previewSettings({ theme: 'light' });
    saveSettings();
    expect(getSettings()).toBe(getSavedSettings());
    expect(getSavedSettings().theme).toBe('light');
  });

  it('저장하면 구독자에게 알린다', async () => {
    const { previewSettings, saveSettings, subscribeSettings } = await loadModule();
    previewSettings({ theme: 'dark' });
    const listener = vi.fn();
    subscribeSettings(listener);
    saveSettings();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('바뀐 게 없으면 저장하지 않는다', async () => {
    const { saveSettings, subscribeSettings } = await loadModule();
    const listener = vi.fn();
    subscribeSettings(listener);
    saveSettings();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('저장에 실패해도 이번 방문 동안은 저장한 값으로 동작한다', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { getSavedSettings, previewSettings, saveSettings } = await loadModule();
    previewSettings({ theme: 'dark' });
    expect(() => saveSettings()).not.toThrow();
    expect(getSavedSettings().theme).toBe('dark');
  });
});

describe('저장하지 않고 떠남', () => {
  it('버리면 저장된 값으로 돌아간다', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, theme: 'light' }));
    const { discardSettings, getSettings, previewSettings } = await loadModule();
    previewSettings({ theme: 'dark', fontSize: 'xlarge' });
    discardSettings();
    expect(getSettings()).toEqual({ ...DEFAULTS, theme: 'light' });
  });

  it('버려도 저장소는 그대로다', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, theme: 'light' }));
    const { discardSettings, previewSettings } = await loadModule();
    previewSettings({ theme: 'dark' });
    discardSettings();
    expect(stored().theme).toBe('light');
  });

  it('버리면 구독자에게 알리고, 버릴 게 없으면 알리지 않는다', async () => {
    const { discardSettings, previewSettings, subscribeSettings } = await loadModule();
    const listener = vi.fn();
    subscribeSettings(listener);
    discardSettings();
    expect(listener).not.toHaveBeenCalled();
    previewSettings({ theme: 'dark' });
    listener.mockClear();
    discardSettings();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('<html>에 적용', () => {
  it('테마·밀도·글자 배율을 붙인다', async () => {
    const { applySettings } = await loadModule();
    applySettings({ theme: 'dark', density: 'compact', sidebar: 'expanded', fontSize: 'large' });
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.density).toBe('compact');
    expect(root.style.getPropertyValue('--font-scale')).toBe('1.1');
  });

  it('라이트를 고르면 시스템이 다크여도 라이트다', async () => {
    stubSystemDark(true);
    const { applySettings } = await loadModule();
    applySettings({ ...DEFAULTS, theme: 'light' });
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it.each([[true, 'dark'], [false, 'light']])('시스템을 고르면 기기 설정(다크 %s)을 따른다', async (isDark, expected) => {
    stubSystemDark(isDark);
    const { applySettings } = await loadModule();
    applySettings({ ...DEFAULTS, theme: 'system' });
    expect(document.documentElement.dataset.theme).toBe(expected);
  });

  it('임대인 웹을 떠나면 붙인 값을 걷는다 (다른 화면은 기본 모습)', async () => {
    const { applySettings, clearSettings } = await loadModule();
    applySettings({ theme: 'dark', density: 'compact', sidebar: 'expanded', fontSize: 'large' });
    clearSettings();
    const root = document.documentElement;
    expect(root.dataset.theme).toBeUndefined();
    expect(root.dataset.density).toBeUndefined();
    expect(root.style.getPropertyValue('--font-scale')).toBe('');
  });

  it('기기의 라이트·다크 설정이 바뀌면 알려 준다', async () => {
    const listeners = stubSystemDark(false);
    const { subscribeSystemTheme } = await loadModule();
    const listener = vi.fn();
    const unsubscribe = subscribeSystemTheme(listener);
    listeners.forEach((fn) => fn());
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
