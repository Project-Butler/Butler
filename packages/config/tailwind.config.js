// 색은 CSS 변수(rgb 채널)로 둔다. 값은 apps/butler/src/index.css 의 :root(라이트)와 [data-theme='dark'] 에 있다.
// bg-surface/70 같은 투명도 표기가 되도록 <alpha-value> 를 쓴다.
const color = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

// 글자 크기는 --font-scale(기본 1)로 늘이고 줄인다. 임대인 웹 설정의 '글자 크기'가 이 값을 바꾼다. 간격(rem)은 그대로다.
const px = (size) => `calc(${size}px * var(--font-scale, 1))`;

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        // hover: 채운 버튼 위에 마우스를 올렸을 때의 배경. 다크에서 strong(글자용, 밝은색)과 달라서 따로 둔다.
        accent: { DEFAULT: color('accent'), strong: color('accent-strong'), soft: color('accent-soft'), hover: color('accent-hover') },
        // box·dash·slot: Figma 01 Foundations 에 있고 여기엔 없던 색(#97). 기존 값은 바꾸지 않았다.
        seal: { DEFAULT: color('seal'), ink: color('seal-ink'), soft: color('seal-soft'), box: color('seal-box'), hover: color('seal-hover') },
        ink: { DEFAULT: color('ink'), 2: color('ink-2'), 3: color('ink-3') },
        ok: { DEFAULT: color('ok'), ink: color('ok-ink'), soft: color('ok-soft') },
        warn: { DEFAULT: color('warn'), ink: color('warn-ink'), soft: color('warn-soft') },
        crit: { DEFAULT: color('crit'), ink: color('crit-ink'), soft: color('crit-soft'), box: color('crit-box') },
        ground: color('ground'),
        surface: color('surface'),
        'surface-2': color('surface-2'),
        line: color('line'),
        dash: color('dash'),
        slot: color('slot'),
      },
      fontFamily: {
        sans: ['IBM Plex Sans KR', 'Malgun Gothic', 'sans-serif'],
        num: ['Pretendard', 'IBM Plex Sans KR', 'Malgun Gothic', 'sans-serif'],
      },
      // design.md §3 글자 단계. 굵기·색은 클래스로 따로 지정한다.
      fontSize: {
        display: [px(32), { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        page: [px(28), { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        'page-sm': [px(24), { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        h1: [px(22), { lineHeight: '1.35' }],
        section: [px(18), { lineHeight: '1.4' }],
        card: [px(16), { lineHeight: '1.4' }],
        body: [px(14), { lineHeight: '1.5' }],
        label: [px(13), { lineHeight: '1.4' }],
        sub: [px(12.5), { lineHeight: '1.4' }],
        chip: [px(12), { lineHeight: '1.3' }],
        eyebrow: [px(11.5), { lineHeight: '1.3', letterSpacing: '0.06em' }],
        kpi: [px(28), { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        // 아래는 Figma 01 Foundations 에 있고 위에 없던 글자 단계(#97). 줄 높이·자간은 Figma 값 그대로이고, 굵기는 클래스로 정한다.
        // card-sm 15/SemiBold · tab 11/Medium(선택된 탭 tab-on 은 같은 크기 + font-semibold) · btn 15/SemiBold · btn-sm 14/SemiBold · num/lg 20/Bold
        // (위의 기존 단계는 Figma 와 줄 높이가 다른 곳이 있지만 이번에는 덮어쓰지 않았다.)
        'card-sm': [px(15), { lineHeight: '1.5' }],
        tab: [px(11), { lineHeight: '1.5' }],
        btn: [px(15), { lineHeight: '1.5' }],
        'btn-sm': [px(14), { lineHeight: '1.5' }],
        'num-lg': [px(20), { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        // #98 앱(모바일) 화면용. 위 기존 단계(h1·card·label·sub·chip·kpi)는 줄 높이가 Figma 와 달라서(웹 화면을 지키려고) 덮어쓰지 않고,
        // Figma 값(줄 높이 1.5, 숫자 단계는 1.3) 그대로인 새 키를 따로 둔다. 웹 화면은 계속 위 기존 키를 쓴다.
        'm-h1': [px(22), { lineHeight: '1.5' }],
        'm-card': [px(16), { lineHeight: '1.5' }],
        'm-label': [px(13), { lineHeight: '1.5' }],
        'm-sub': [px(12.5), { lineHeight: '1.5' }],
        'm-chip': [px(12), { lineHeight: '1.5' }],
        'num-kpi': [px(28), { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        'num-body': [px(14), { lineHeight: '1.3' }],
        'num-sub': [px(12.5), { lineHeight: '1.3' }],
      },
      borderRadius: {
        card: '14px',
        btn: '12px',
        input: '10px',
        chip: '8px',
      },
    },
  },
  plugins: [],
};
