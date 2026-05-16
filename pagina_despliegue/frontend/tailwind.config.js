/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        surface: "#080808",
        "surface-2": "#0d0d0d",
        border: "#181818",
        "border-subtle": "#222222",
        muted: "#5a5a5a",
        "muted-foreground": "#888888",
        foreground: "#e8e8e8",
        primary: {
          DEFAULT: "#e8e8e8",
          foreground: "#080808",
        },
        accent: {
          DEFAULT: "#ffffff",
          glow: "rgba(255, 255, 255, 0.15)",
          subtle: "rgba(255, 255, 255, 0.05)",
        },
        rust: {
          DEFAULT: "#ce422b",
          light: "#e05c40",
          glow: "rgba(206, 66, 43, 0.35)",
        },
        success: "#2ea043",
        warning: "#d29922",
      },
      fontFamily: {
        mono: ["Geist Mono Variable", "Menlo", "Monaco", "monospace"],
        sans: ["Geist Variable", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "blink": "blink 1.2s step-end infinite",
        "float": "float 6s ease-in-out infinite",
        "scan": "scan 4s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(255, 255, 255, 0.05)" },
          "50%": { boxShadow: "0 0 40px rgba(255, 255, 255, 0.15)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(400%)" },
        },
      },
      boxShadow: {
        "glow-accent": "0 0 30px rgba(255, 255, 255, 0.1)",
        "glow-rust": "0 0 30px rgba(206, 66, 43, 0.3)",
        "inner-subtle": "inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      backgroundImage: {
      "grid-pattern":
          "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
        "noise": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E\")",
      },
      backgroundSize: {
        "grid": "32px 32px",
      },
    },
  },
  plugins: [],
};
