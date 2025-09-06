// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // IMPORTANTÍSIMO:
  // - No pongas `output: "export"` aquí.
  // - No pongas `experimental: { ppr: true }` ni nada raro que fuerce export.
};

export default nextConfig;
