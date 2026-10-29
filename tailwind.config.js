/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        olive: '#687653',
        forest: '#354735',
        nude: '#E8D8C8',
        cream: '#F7F3ED',
        gold: '#B69A62',
        muted: '#73776F',
      },
      fontFamily: {
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['"Nunito Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '1.25rem' },
      boxShadow: { card: '0 1px 2px rgba(53,71,53,.06), 0 8px 24px -12px rgba(53,71,53,.15)' },
    },
  },
  plugins: [],
}
