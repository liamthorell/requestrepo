import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  darkMode: "class",
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            background: "#f7f5ef",
            foreground: "#282922",
            primary: {
              50: "#fff3e6",
              100: "#fde6c8",
              200: "#facc98",
              300: "#f4ad57",
              400: "#df913a",
              500: "#c97723",
              600: "#ad5a19",
              700: "#894318",
              800: "#673419",
              900: "#432519",
              DEFAULT: "#ad5a19",
              foreground: "#ffffff",
            },
            focus: "#ad5a19",
            content1: "#ffffff",
            content2: "#eeece5",
            content3: "#e4e1d8",
            content4: "#d5d1c7",
          },
        },
        dark: {
          colors: {
            background: "#121613",
            foreground: "#e9ece4",
            primary: {
              50: "#302619",
              100: "#40321f",
              200: "#66481f",
              300: "#8a6129",
              400: "#bd863d",
              500: "#f4ad57",
              600: "#f4ad57",
              700: "#fac58c",
              800: "#ffddb5",
              900: "#fff0df",
              DEFAULT: "#f4ad57",
              foreground: "#241c12",
            },
            focus: "#f4ad57",
            content1: "#1a201b",
            content2: "#222a23",
            content3: "#303b32",
            content4: "#435045",
            default: {
              50: "#171d18",
              100: "#222a23",
              200: "#303b32",
              300: "#435045",
              400: "#849286",
              500: "#a0ada1",
              600: "#b8c2b7",
              700: "#cdd5c9",
              800: "#dfe5db",
              900: "#eff2eb",
              DEFAULT: "#303b32",
              foreground: "#e9ece4",
            },
          },
        },
      },
    }),
  ],
} satisfies Config;
