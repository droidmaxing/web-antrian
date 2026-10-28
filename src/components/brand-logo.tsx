import { logoDataUrl, type BrandTheme } from "@/modules/tenancy/brand";

/**
 * Renders the business logo, or the shipped wordmark when none is set. Used by
 * both server and client components, so it stays hook-free.
 */
export function BrandLogo({ theme, className }: { theme?: BrandTheme; className?: string }) {
  const src = theme ? logoDataUrl(theme) : null;
  if (src) {
    // Tenant logos are small data URLs from the database; next/image would only
    // add an optimisation pass that cannot help an inline image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="size-full object-contain" />;
  }
  return <span className={className ?? "text-lg font-black"}>a.</span>;
}
