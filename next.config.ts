import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import withSerwistInit from "@serwist/next";

const withPWA = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  swUrl: "/sw.js",
  register: true,
  manifestTransforms: [async (entries) => ({
    manifest: [
      ...entries,
      {
        url: "/~offline",
        // This route is served by Next.js, rather than emitted as a worker asset.
        size: 0,
        revision: createHash("sha256")
          .update(readFileSync("src/app/~offline/page.tsx"))
          .digest("hex"),
      },
    ],
    warnings: [],
  })],
  // Runtime routing handles public navigation; explicit route precaching could
  // otherwise save authenticated HTML outside the NetworkOnly barriers.
  cacheOnNavigation: false,
  // Reconnecting must not reload an unfinished checkout.
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  // Only public install assets belong in the precache. Native installers,
  // old generated workers and merchant credentials must never enter it.
  globPublicPatterns: [
    "icons/**/*",
    "manifest.json",
    "icon.svg",
    "apple-touch-icon.png",
  ],
});

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "tvamqoenwmwnmmbntyyf.supabase.co",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default withPWA(nextConfig);
