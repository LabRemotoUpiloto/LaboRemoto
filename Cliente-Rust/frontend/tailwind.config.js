/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Compartidos entre los modales de celebración de la práctica de
        // Linux (medalla, póster) -- ver ModuleCompleteCelebration.tsx /
        // PosterUnlockCelebration.tsx.
        popIn: {
          '0%': { transform: 'scale(0.8) translateY(10px)', opacity: '0' },
          '100%': { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        spinSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        confettiFall: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { transform: 'translateY(115vh) rotate(360deg)', opacity: '0' },
        },
        fireworkRing: {
          '0%': { transform: 'scale(0)', opacity: '1' },
          '70%': { opacity: '0.5' },
          '100%': { transform: 'scale(7)', opacity: '0' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.2s ease-out',
        slideUp: 'slideUp 0.3s ease-out',
        popIn: 'popIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
        spinSlow: 'spinSlow 30s linear infinite',
        confettiFall: 'confettiFall 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        fireworkRing: 'fireworkRing 2.2s ease-out infinite',
      },
    },
  },
  plugins: [],
}
