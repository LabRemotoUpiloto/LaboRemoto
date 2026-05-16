/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#050508",
        surface: "#0a0a12",
        "surface-2": "#0f0f1a",
        "surface-3": "#141428",
        border: "#1a1a2e",
        "border-subtle": "#222240",
        muted: "#4a4a6a",
        "muted-foreground": "#8888aa",
        foreground: "#e2e2e2",
        primary: {
          DEFAULT: "#e2e2e2",
          foreground: "#050508",
        },
        cyan: {
          DEFAULT: "#00d2be",
          light: "#00f0d8",
          dim: "#00a090",
          glow: "rgba(0, 210, 190, 0.25)",
          subtle: "rgba(0, 210, 190, 0.07)",
        },
        electric: {
          DEFAULT: "#3d7fff",
          glow: "rgba(61, 127, 255, 0.25)",
        },
        success: "#00c896",
        warning: "#f0a500",
        danger: "#ff4a6e",
      },
      fontFamily: {
        mono: ["Geist Mono Variable", "Menlo", "Monaco", "monospace"],
        sans: ["Geist Variable", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "blink": "blink 1.1s step-end infinite",
        "border-pulse": "borderPulse 2.5s ease-in-out infinite",
        "spin-slow": "spin 8s linear infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        borderPulse: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      boxShadow: {
        "glow-cyan": "0 0 30px rgba(0, 210, 190, 0.15), 0 0 60px rgba(0, 210, 190, 0.05)",
        "glow-cyan-strong": "0 0 0 1px rgba(0, 210, 190, 0.3), 0 0 40px rgba(0, 210, 190, 0.15)",
        "glow-electric": "0 0 30px rgba(61, 127, 255, 0.15)",
        "inner-top": "inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(0,210,190,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,210,190,0.03) 1px, transparent 1px)",
        "radial-dark": "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0, 210, 190, 0.08) 0%, transparent 70%)",
        "radial-bottom": "radial-gradient(ellipse 60% 40% at 50% 100%, rgba(61, 127, 255, 0.06) 0%, transparent 70%)",
      },
      backgroundSize: {
        "grid": "32px 32px",
      },
    },
  },
  plugins: [],
};
