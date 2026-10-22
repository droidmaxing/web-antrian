import { AppError } from "@/modules/shared/errors";

/**
 * Single source of truth for the public base URL of this deployment.
 *
 * Resolution order:
 * 1. `APP_URL` (server runtime / container environment)
 * 2. `NEXT_PUBLIC_APP_URL` (build-time public value)
 * 3. Forwarded request headers (host + proto) when a proxy is in front
 *
 * No environment-specific host is ever baked into the source code.
 */
export function resolveAppUrl(headers?: Headers): string {
  const configured = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL)?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const host = headers?.get("x-forwarded-host") ?? headers?.get("host");
  if (host) {
    const proto =
      headers?.get("x-forwarded-proto") ??
      process.env.APP_PROTOCOL?.trim() ??
      "http";
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  throw new AppError(
    "APP_URL belum dikonfigurasi. Atur environment APP_URL sesuai domain deployment.",
    500,
    "APP_URL_MISSING",
  );
}

/** Absolute URL for a path, using the deployment base URL. */
export function absoluteUrl(path: string, headers?: Headers): string {
  const base = resolveAppUrl(headers);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Builds a Request that carries the real client headers for server components.
 * Used by rate limiting, which needs the forwarded client address.
 */
export function requestFromHeaders(incoming: Headers): Request {
  return new Request(resolveAppUrl(incoming), { headers: incoming });
}
