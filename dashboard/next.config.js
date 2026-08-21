/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard reads from a local SQLite file. We don't deploy this to
  // Vercel as a serverless function (Vercel doesn't have a writable
  // filesystem). The intended deploy is a VPS or Railway. If you want a
  // static deploy, swap the SQLite reads for fetch() against an API.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

module.exports = nextConfig;
