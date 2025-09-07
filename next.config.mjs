// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async redirects() {
    return [
      {
        source: "/login",
        destination: "/signin",
        permanent: false, // 307
      },
    ];
  },
};

export default nextConfig;
