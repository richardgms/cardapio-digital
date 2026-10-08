import test from "node:test";
import assert from "node:assert/strict";
import cachePolicy from "../src/lib/pwa/cache-policy.ts";
const { requiresNetworkOnly } = cachePolicy;

test("private routes and installer downloads always require the network", () => {
  for (const path of [
    "/admin", "/admin/impressao", "/admin/produtos?RSC=1", "/auth",
    "/auth/callback?code=ficticio", "/api", "/api/printing/agent",
    "/printing", "/printing/RMenu-Instalar.exe",
  ]) {
    assert.equal(requiresNetworkOnly(new URL(path, "https://teste1.example.com")), true, path);
  }
});

test("Supabase credentials, private objects and order APIs cannot be cached", () => {
  for (const path of [
    "/rest/v1/orders", "/rest/v1/rpc/submit_order", "/auth/v1/user",
    "/storage/v1/object/sign/images/private.png?token=ficticio",
    "/storage/v1/object/authenticated/images/private.png",
  ]) {
    assert.equal(requiresNetworkOnly(new URL(path, "https://project.supabase.co")), true, path);
  }
});

test("public storefront, install assets and public images keep normal PWA routing", () => {
  for (const path of ["/", "/manifest.json", "/icons/icon-192x192.png", "/_next/static/chunk.js"]) {
    assert.equal(requiresNetworkOnly(new URL(path, "https://teste1.example.com")), false, path);
  }
  assert.equal(requiresNetworkOnly(new URL("https://project.supabase.co/storage/v1/object/public/images/item.png")), false);
});
