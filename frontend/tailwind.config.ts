import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

// Warm neutrals (wrapping paper / charred grill) with one chili-red accent.
// The --lab-* CSS variables in index.css mirror these for hand-written styles.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Archivo Variable"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      layout: {
        radius: { small: "3px", medium: "5px", large: "6px" },
        borderWidth: { small: "1px", medium: "1px", large: "1px" },
        boxShadow: { small: "none", medium: "none", large: "none" },
      },
      themes: {
        light: {
          colors: {
            background: "#f4efe6",
            foreground: "#1f1915",
            divider: "#e0d6c6",
            focus: "#c43a20",
            content1: "#fbf8f2",
            content2: "#efe8dc",
            content3: "#e6dccd",
            content4: "#d8ccba",
            default: {
              50: "#f7f3ec",
              100: "#efe8dc",
              200: "#e3d9ca",
              300: "#d3c6b3",
              400: "#a39483",
              500: "#776a5d",
              600: "#5d5248",
              700: "#463d35",
              800: "#2f2924",
              900: "#1f1915",
              DEFAULT: "#e3d9ca",
              foreground: "#1f1915",
            },
            primary: {
              50: "#fcece8",
              100: "#f8d4cb",
              200: "#f0a796",
              300: "#e67a61",
              400: "#d9573a",
              500: "#c43a20",
              600: "#a52f19",
              700: "#842514",
              800: "#621b0f",
              900: "#40120a",
              DEFAULT: "#c43a20",
              foreground: "#ffffff",
            },
          },
        },
        dark: {
          colors: {
            background: "#13100e",
            foreground: "#ede5d9",
            divider: "#2f2824",
            focus: "#f06a4c",
            content1: "#1a1614",
            content2: "#221d1a",
            content3: "#2b2521",
            content4: "#38302b",
            default: {
              50: "#1a1614",
              100: "#221d1a",
              200: "#2f2824",
              300: "#433a34",
              400: "#6b6058",
              500: "#9a8d80",
              600: "#b7ab9e",
              700: "#cfc5b8",
              800: "#e1d8cc",
              900: "#ede5d9",
              DEFAULT: "#2f2824",
              foreground: "#ede5d9",
            },
            primary: {
              50: "#2a130d",
              100: "#401b11",
              200: "#6a2a19",
              300: "#953a22",
              400: "#bf4529",
              500: "#d6492b",
              600: "#e85a3b",
              700: "#f07c61",
              800: "#f6a693",
              900: "#fbd3c9",
              DEFAULT: "#d6492b",
              foreground: "#ffffff",
            },
          },
        },
      },
    }),
  ],
} satisfies Config;
