/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  output: "standalone",
};

module.exports = nextConfig;
