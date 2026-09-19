/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand blue from the Android app (colorPrimary #2196F3).
        brand: {
          50: '#E3F2FD',
          100: '#BBDEFB',
          200: '#90CAF9',
          300: '#64B5F6',
          400: '#42A5F5',
          500: '#2196F3',
          600: '#1E88E5',
          700: '#1976D2',
          800: '#1565C0',
          900: '#0D47A1',
        },
      },
      fontFamily: {
        display: ['"EasyBold"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pop: { '0%': { transform: 'scaleX(0)' }, '100%': { transform: 'scaleX(1)' } },
        wiggle: { '0%, 100%': { transform: 'rotate(-10deg)' }, '50%': { transform: 'rotate(10deg)' } },
      },
      animation: {
        pop: 'pop 0.5s ease-out',
        wiggle: 'wiggle 0.6s ease-in-out 3',
      },
    },
  },
  plugins: [],
};
