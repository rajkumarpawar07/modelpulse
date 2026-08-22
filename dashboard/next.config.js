/** @type {import('next').NextConfig} */

// Data files the serverless functions read at runtime. fs reads are not
// auto-traced, so they must be listed explicitly to ship inside the lambda.
const DB_FILES = ["./data/modelpulse.db", "./collectors.json"];

const nextConfig = {
  reactStrictMode: true,
  // The dashboard reads the committed SQLite DB (dashboard/data/modelpulse.db)
  // read-only. better-sqlite3 is a native module: keep it external to the
  // serverless bundle, and trace the data files into every route that reads
  // them. allowScripts in package.json lets its install script
  // (prebuild-install) run on npm 11.16+/12, which blocks install scripts
  // by default.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
    outputFileTracingIncludes: {
      "/": DB_FILES,
      "/health": DB_FILES,
      "/timeline": DB_FILES,
      "/stats": DB_FILES,
      "/vendor/[slug]": DB_FILES,
      "/feed": DB_FILES,
      "/feed/[vendor]": DB_FILES,
      "/api/changes": DB_FILES,
    },
  },
};

module.exports = nextConfig;
