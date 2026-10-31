import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { brandTitle, brandVars, logoDataUrl } from "@/modules/tenancy/brand";
import { getTheme } from "@/modules/tenancy/theme-service";

/** Satu lookup per request, dipakai metadata dan pembungkus warna. */
const workspaceBrand = cache(async (slug: string) => {
  const business = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  return business ? { business, theme: await getTheme(business.id) } : null;
});

/**
 * Judul tab dan favicon seluruh halaman dashboard mengikuti branding workspace:
 * judul kustom (atau nama bisnis) dan logo yang diunggah Super Admin.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}): Promise<Metadata> {
  const { businessSlug } = await params;
  const brand = await workspaceBrand(businessSlug);
  if (!brand) return {};
  return {
    title: brandTitle(brand.theme, brand.business.name),
    icons: { icon: logoDataUrl(brand.theme) ?? "/icon.svg" },
  };
}

/**
 * Warna workspace dipasang di layout, bukan per halaman: layar error dan 404 di
 * dalam workspace tetap memakai warna perusahaan karena layout tidak ikut diganti.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const brand = await workspaceBrand(businessSlug);
  return <div style={brandVars(brand?.theme)}>{children}</div>;
}
