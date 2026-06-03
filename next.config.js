/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  output: "standalone",
  serverExternalPackages: ["xlsx"],
};

module.exports = nextConfig;
