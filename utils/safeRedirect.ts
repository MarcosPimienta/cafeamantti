/**
 * Only same-site paths may be used as a post-login destination. Anything
 * else — absolute URLs, protocol-relative "//host", "/\host", or values that
 * would turn the origin into userinfo ("@host") — falls back to `fallback`,
 * so a crafted link cannot bounce a signed-in customer to another site.
 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;
  return path;
}
