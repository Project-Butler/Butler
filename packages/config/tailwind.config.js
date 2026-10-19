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
        'surface-2': '#F3F6F5',
        line: '#DCE3E0',
      },
      fontFamily: {
        sans: ['Pretendard', 'IBM Plex Sans KR', 'Malgun Gothic', 'sans-serif'],
        num: ['Pretendard', 'IBM Plex Sans KR', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        btn: '12px',
        input: '10px',
      },
    },
  },
  plugins: [],
};
