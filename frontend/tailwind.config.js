/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  // Evita conflito de especificidade com os componentes do Angular Material.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // Tokens do novo design (frontend/design/DESIGN.md).
      colors: {
        page: '#F5F5F2',
        surface: { DEFAULT: '#FFFFFF', muted: '#F7F7F4', sunken: '#F0F0EC' },
        ink: { DEFAULT: '#15171C', 2: '#4A4F59' },
        muted: '#5B606B',
        line: { DEFAULT: '#E4E4DF', input: '#DADAD4' },
        primary: { DEFAULT: '#3A4FD9', hover: '#2A3BB0', soft: '#ECEEFC' },
        star: '#F2A20C',
        danger: '#B42318',
        track: '#EEEFF1',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        cover: 'inset 6px 0 0 rgba(0,0,0,.13), 0 1px 2px rgba(20,20,20,.08), 0 10px 24px rgba(20,20,20,.10)',
      },
    },
  },
  plugins: [],
}
