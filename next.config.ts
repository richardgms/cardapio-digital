import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    // Never cache API routes or admin pages — auth state must always be fresh.
    // This also prevents the service worker from interfering with Set-Cookie
    // headers returned by the auth callback.
    navigateFallbackDenylist: [/^\/api\//, /^\/admin/, /^\/auth\//],
    runtimeCaching: [
      {
        urlPattern: /^https?:\/\/[^/]+\/api\//,
        handler: "NetworkOnly" as const,
      },
      {
        urlPattern: /^https?:\/\/[^/]+\/admin/,
        handler: "NetworkOnly" as const,
      },
      {
        urlPattern: /^https?:\/\/[^/]+\/auth\//,
        handler: "NetworkOnly" as const,
      },
    ],
  },
});

const nextConfig: NextConfig = {
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
