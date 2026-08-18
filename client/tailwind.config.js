/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./client/src/**/*.{ts,tsx,html}",
    "./client/index.html",
  ],
  theme: {
    extend: {
      colors: {
        // DiamondIQ dark navy system
        bg: {
          base: "#090E13",
          deep: "#0B0F15",
          surface: "#0F1720",
          card: "#121B24",
          elevated: "#182330",
          hover: "#1C2A38",
          border: "#1E2D3D",
        },
        teal: {
          DEFAULT: "#00C8A0",
          bright: "#00DEB2",
          dim: "#009E80",
          muted: "#00C8A015",
          border: "#00C8A030",
        },
        text: {
          primary: "#E8EDF2",
          secondary: "#7A90A6",
          muted: "#4A5F72",
          teal: "#00C8A0",
          amber: "#F5A623",
          red: "#E8464B",
          green: "#2ECC8A",
        },
        status: {
          published: "#2ECC8A",
          pending: "#F5A623",
          updated: "#4A9EF5",
          archived: "#4A5F72",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        condensed: ["Barlow Condensed", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": "0.65rem",
      },
    },
  },
  plugins: [],
};
