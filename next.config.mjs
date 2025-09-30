// next.config.mjs
import withPWA from "next-pwa";

/** @type {import('next').NextConfig} */
const baseConfig = {
  reactStrictMode: true,

  async redirects() {
    return [
      {
        source: "/login",
        destination: "/signin",
        permanent: false, // 307 redirect
      },
    ];
  },
};

const isProd = process.env.NODE_ENV === "production";

export default withPWA({
  dest: "public",    // genera el service worker en /public
  disable: !isProd,  // PWA solo en producción
  register: true,    // registra el SW automáticamente
  skipWaiting: true, // toma control al instalarse
})(baseConfig);
