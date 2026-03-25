/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#2d3a4a',
          100: '#1e293b',
          200: '#1a2332',
          300: '#151d2b',
          400: '#111827',
          500: '#0f172a',
          600: '#0d1117',
          700: '#0a0e14',
        },
        mint: {
          300: '#00f5a0',
          400: '#00d9a0',
          500: '#00c896',
          600: '#00d9f5',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
