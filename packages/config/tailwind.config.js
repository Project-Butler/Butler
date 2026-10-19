/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#0E6B5C', strong: '#0A5246', soft: '#DDEFEA' },
        seal: { DEFAULT: '#34479E', ink: '#2B3B85', soft: '#E4E8F7' },
        ink: { DEFAULT: '#15201C', 2: '#4B5A55', 3: '#5A6863' },
        ok: { DEFAULT: '#1E7F4E', ink: '#17643D', soft: '#DDF1E5' },
        warn: { DEFAULT: '#A0600C', ink: '#85500A', soft: '#FBEBD2' },
        crit: { DEFAULT: '#B83A28', ink: '#9C3020', soft: '#F8E0DB' },
        ground: '#EEF1F0',
        surface: '#FFFFFF',
        'surface-2': '#F3F6F5',
        line: '#DCE3E0',
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
