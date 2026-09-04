import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#0F4C81",
          dark: "#0A3A63",
        },
        ink: "#152A3D",
        muted: "#5D7186",
        line: "#D7E1E8",
        canvas: "#F5F8FA",
      },
    },
  },
  plugins: [],
};

export default config;
