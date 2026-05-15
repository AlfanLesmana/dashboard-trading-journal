export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#f59e0b", dark: "#d97706", light: "#fbbf24" },
        surface: { DEFAULT: "#1f2937", dark: "#111827", darker: "#0f172a" },
        border: "#374151",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px" }],
      },
    },
  },
  plugins: [],
}
