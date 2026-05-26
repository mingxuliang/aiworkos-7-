/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  // Prefix to avoid conflicts with Ant Design global styles
  corePlugins: {
    preflight: false,
  },
};
