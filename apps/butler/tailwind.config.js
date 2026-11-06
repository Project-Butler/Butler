import sharedConfig from '@butler/config/tailwind.config.js';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [sharedConfig],
  content: ['./index.html', './src/**/*.{js,jsx}', '../../packages/ui/src/**/*.{js,jsx}'],
};
