/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Coral red palette - primary brand color #FF4040
        coral: {
          50: '#fff5f5',
          100: '#ffe0e0',
          200: '#ffbdbd',
          300: '#ff8a8a',
          400: '#ff5757',
          500: '#FF4040',
          600: '#e62e2e',
          700: '#c22424',
          800: '#9f2020',
          900: '#831f1f',
          950: '#470b0b',
        },
        // Navy blue palette - secondary brand color #193153
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#b6c6d9',
          300: '#8da2be',
          400: '#647d9f',
          500: '#4a6282',
          600: '#3a4d68',
          700: '#2f3f55',
          800: '#273347',
          900: '#193153',
          950: '#0f1d31',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
