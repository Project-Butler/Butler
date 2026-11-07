/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#0E6B5C', strong: '#0A5246', soft: '#DDEFEA' },
        // box·dash·slot: Figma 01 Foundations 에 있고 여기엔 없던 색(#97). 기존 값은 바꾸지 않았다.
        seal: { DEFAULT: '#34479E', ink: '#2B3B85', soft: '#E4E8F7', box: '#F6F7FD' },
        ink: { DEFAULT: '#15201C', 2: '#4B5A55', 3: '#5A6863' },
        ok: { DEFAULT: '#1E7F4E', ink: '#17643D', soft: '#DDF1E5' },
        warn: { DEFAULT: '#A0600C', ink: '#85500A', soft: '#FBEBD2' },
        crit: { DEFAULT: '#B83A28', ink: '#9C3020', soft: '#F8E0DB', box: '#FDF3F1' },
        ground: '#EEF1F0',
        surface: '#FFFFFF',
        'surface-2': '#F3F6F5',
        line: '#DCE3E0',
        dash: '#B9C4C0',
        slot: '#9AA8A3',
      },
      fontFamily: {
        sans: ['IBM Plex Sans KR', 'Malgun Gothic', 'sans-serif'],
        num: ['Pretendard', 'IBM Plex Sans KR', 'Malgun Gothic', 'sans-serif'],
      },
      // design.md §3 글자 단계. 굵기·색은 클래스로 따로 지정한다.
      fontSize: {
        display: ['32px', { lineHeight: '1.25', letterSpacing: '-0.02em' }],
        page: ['28px', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        'page-sm': ['24px', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        h1: ['22px', { lineHeight: '1.35' }],
        section: ['18px', { lineHeight: '1.4' }],
        card: ['16px', { lineHeight: '1.4' }],
        body: ['14px', { lineHeight: '1.5' }],
        label: ['13px', { lineHeight: '1.4' }],
        sub: ['12.5px', { lineHeight: '1.4' }],
        chip: ['12px', { lineHeight: '1.3' }],
        eyebrow: ['11.5px', { lineHeight: '1.3', letterSpacing: '0.06em' }],
        kpi: ['28px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        // 아래는 Figma 01 Foundations 에 있고 위에 없던 글자 단계(#97). 줄 높이·자간은 Figma 값 그대로이고, 굵기는 클래스로 정한다.
        // card-sm 15/SemiBold · tab 11/Medium(선택된 탭 tab-on 은 같은 크기 + font-semibold) · btn 15/SemiBold · btn-sm 14/SemiBold · num/lg 20/Bold
        // (위의 기존 단계는 Figma 와 줄 높이가 다른 곳이 있지만 이번에는 덮어쓰지 않았다.)
        'card-sm': ['15px', { lineHeight: '1.5' }],
        tab: ['11px', { lineHeight: '1.5' }],
        btn: ['15px', { lineHeight: '1.5' }],
        'btn-sm': ['14px', { lineHeight: '1.5' }],
        'num-lg': ['20px', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        // #98 앱(모바일) 화면용. 위 기존 단계(h1·card·label·sub·chip·kpi)는 줄 높이가 Figma 와 달라서(웹 화면을 지키려고) 덮어쓰지 않고,
        // Figma 값(줄 높이 1.5, 숫자 단계는 1.3) 그대로인 새 키를 따로 둔다. 웹 화면은 계속 위 기존 키를 쓴다.
        'm-h1': ['22px', { lineHeight: '1.5' }],
        'm-card': ['16px', { lineHeight: '1.5' }],
        'm-label': ['13px', { lineHeight: '1.5' }],
        'm-sub': ['12.5px', { lineHeight: '1.5' }],
        'm-chip': ['12px', { lineHeight: '1.5' }],
        'num-kpi': ['28px', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        'num-body': ['14px', { lineHeight: '1.3' }],
        'num-sub': ['12.5px', { lineHeight: '1.3' }],
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
