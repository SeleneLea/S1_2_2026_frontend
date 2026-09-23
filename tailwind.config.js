/** @type {import('tailwindcss').Config} */
const neutral = {
  50: 'var(--color-background)', 100: 'var(--color-background-secondary)',
  200: 'var(--color-border)', 300: 'var(--color-background-tertiary)',
  400: 'var(--color-text-secondary)', 500: 'var(--color-text-secondary)',
  600: 'var(--color-text-secondary)', 700: 'var(--color-text-primary)',
  800: 'var(--color-text-primary)', 900: 'var(--color-text-primary)', 950: 'var(--color-text-primary)',
};
const botanical = {
  50: 'var(--sage-soft)', 100: 'var(--sage-soft)', 200: 'var(--color-border)',
  300: '#99B898', 400: '#819E80', 500: '#52765A', 600: 'var(--solid-ink)',
  700: 'var(--solid-hover)', 800: 'var(--sage-ink)', 900: 'var(--sage-ink)',
};
const warm = {
  50: 'var(--peach-soft)', 100: 'var(--peach-soft)', 200: '#FECEA8',
  300: '#E8B695', 400: '#CD966F', 500: '#A2673C', 600: '#835533',
  700: '#735033', 800: 'var(--peach-ink)', 900: 'var(--peach-ink)',
};
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: { extend: { colors: {
    gray: neutral, slate: neutral,
    blue: botanical, indigo: botanical, purple: botanical, sky: botanical,
    green: botanical, emerald: botanical, teal: botanical, cyan: botanical,
    yellow: warm, amber: warm, orange: warm, pink: warm,
    red: { 50: 'var(--salmon-soft)', 100: 'var(--salmon-soft)', 200: '#FFB6AE', 300: '#FF9C94', 400: '#FF847C', 500: '#E84A5F', 600: '#C33248', 700: '#A5273B', 800: 'var(--color-error)', 900: 'var(--color-error)' },
  } } },
  plugins: [],
};
