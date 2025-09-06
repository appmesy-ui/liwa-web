// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No poner `output: "export"` porque rompe Supabase Auth
};

export default nextConfig;
