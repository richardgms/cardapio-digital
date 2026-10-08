/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, Serwist, type PrecacheEntry } from "serwist";
import { requiresNetworkOnly } from "../lib/pwa/cache-policy";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // SwUpdateToast activates updates after the user confirms. Its checkout
  // lock continues to defer a reload while a purchase is being submitted.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => requiresNetworkOnly(url),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{
      url: "/~offline",
      matcher: ({ request }) => request.destination === "document" &&
        !requiresNetworkOnly(new URL(request.url)),
    }],
  },
});

serwist.addEventListeners();
