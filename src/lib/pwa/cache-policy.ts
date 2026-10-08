/** Keep authenticated traffic and printer downloads outside the PWA cache. */
export function requiresNetworkOnly(url: URL): boolean {
  if (/^\/(?:api|admin|auth|printing)(?:\/|$)/.test(url.pathname)) {
    return true;
  }

  // The browser can also talk directly to Supabase. Only deliberately public
  // storage images may use the normal image cache, never REST/auth/RPC traffic.
  return url.hostname.endsWith(".supabase.co") &&
    !url.pathname.startsWith("/storage/v1/object/public/");
}
