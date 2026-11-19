// 임대인 웹 화면 설정(테마·밀도·사이드바·글자 크기). 기기별로 localStorage 에 남긴다(계정과 동기화하지 않는다).
// 메뉴 구성은 설정으로 바꾸지 않는다. 여기는 화면을 어떻게 보여 줄지만 다룬다.
//
// 값은 두 겹이다. 저장된 값(saved)은 웹을 열 때마다 적용되고, 설정 화면에서 고르는 값(draft)은 저장 전까지 이번 화면에만 미리 적용된다.
// 저장(saveSettings)하면 draft 가 saved 가 되고, 저장하지 않고 떠나면(discardSettings) 저장된 값으로 돌아간다.
const STORAGE_KEY = 'butler.landlord.display';

export const THEME_OPTIONS = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];
export const DENSITY_OPTIONS = [
  { value: 'default', label: '기본' },
  { value: 'compact', label: '컴팩트' },
];
export const SIDEBAR_OPTIONS = [
  { value: 'expanded', label: '펼침' },
  { value: 'collapsed', label: '아이콘만' },
  { value: 'auto', label: '자동 접힘' },
];
// scale 은 글자 크기에만 곱해진다(--font-scale). 간격은 그대로다.
export const FONT_SIZE_OPTIONS = [
  { value: 'small', label: '작게', scale: 0.9 },
  { value: 'default', label: '기본', scale: 1 },
  { value: 'large', label: '크게', scale: 1.1 },
  { value: 'xlarge', label: '아주 크게', scale: 1.25 },
];

export const DEFAULT_SETTINGS = { theme: 'system', density: 'default', sidebar: 'expanded', fontSize: 'default' };

const OPTIONS_BY_KEY = {
  theme: THEME_OPTIONS,
  density: DENSITY_OPTIONS,
  sidebar: SIDEBAR_OPTIONS,
  fontSize: FONT_SIZE_OPTIONS,
};

// 저장된 값이 옵션에 없거나(옛 값·손으로 고친 값) 읽을 수 없으면 항목별로 기본값을 쓴다.
const sanitize = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(
    Object.entries(OPTIONS_BY_KEY).map(([key, options]) => [
      key,
      options.some((option) => option.value === source[key]) ? source[key] : DEFAULT_SETTINGS[key],
    ]),
  );
};

const isSame = (a, b) => Object.keys(OPTIONS_BY_KEY).every((key) => a[key] === b[key]);

// localStorage 는 막히거나(시크릿 창·차단) 값이 깨져 있을 수 있어 읽고 쓰기를 모두 감싼다. 실패해도 이번 방문 동안은 메모리 값으로 동작한다.
const readStored = () => {
  try {
    return sanitize(JSON.parse(window.localStorage.getItem(STORAGE_KEY)));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const writeStored = (settings) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 저장하지 못해도 화면 설정은 그대로 적용한다.
  }
};

// useSyncExternalStore 용 저장소. getSettings·getSavedSettings 는 값이 바뀌지 않으면 같은 객체를 돌려줘야 한다.
let saved = null;
let draft = null;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener());

// 저장된 값
export const getSavedSettings = () => {
  if (!saved) saved = readStored();
  return saved;
};

// 지금 화면에 적용할 값: 저장 전에 고르는 중이면 그 값, 아니면 저장된 값
export const getSettings = () => draft ?? getSavedSettings();

export const subscribeSettings = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// 저장하지 않고 미리 적용한다. 저장된 값과 같아지면 고르는 중인 값을 비운다(저장할 변경이 없다).
export const previewSettings = (patch) => {
  const next = sanitize({ ...getSettings(), ...patch });
  draft = isSame(next, getSavedSettings()) ? null : next;
  notify();
};

// 기본값으로 미리 적용한다. 저장해야 남는다.
export const resetSettings = () => previewSettings(DEFAULT_SETTINGS);

// 고르는 중인 값을 저장한다. 바뀐 게 없으면 아무것도 하지 않는다.
export const saveSettings = () => {
  if (!draft) return;
  saved = draft;
  draft = null;
  writeStored(saved);
  notify();
};

// 저장하지 않은 변경을 버리고 저장된 값으로 돌아간다.
export const discardSettings = () => {
  if (!draft) return;
  draft = null;
  notify();
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

export const subscribeSystemTheme = (listener) => {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};

// <html>에 테마·밀도·글자 배율을 붙인다. 값은 apps/butler/src/index.css 와 tailwind 설정이 읽는다.
export const applySettings = (settings) => {
  const root = document.documentElement;
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia(DARK_QUERY).matches);
  root.dataset.theme = isDark ? 'dark' : 'light';
  root.dataset.density = settings.density;
  const { scale } = FONT_SIZE_OPTIONS.find((option) => option.value === settings.fontSize);
  root.style.setProperty('--font-scale', String(scale));
};

// 임대인 웹을 떠나면(관리자·임차인·앱 화면) 붙였던 값을 걷어 기본 화면으로 돌린다.
export const clearSettings = () => {
  const root = document.documentElement;
  delete root.dataset.theme;
  delete root.dataset.density;
  root.style.removeProperty('--font-scale');
};
