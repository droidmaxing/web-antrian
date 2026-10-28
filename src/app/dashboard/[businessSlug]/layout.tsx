import type { Metadata } from "next";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { brandTitle, logoDataUrl } from "@/modules/tenancy/brand";
import { getTheme } from "@/modules/tenancy/theme-service";

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
  const business = await prisma.business.findUnique({
    where: { slug: businessSlug },
    select: { id: true, name: true },
  });
  if (!business) return {};
  const theme = await getTheme(business.id);
  const title = brandTitle(theme, business.name);
  return {
    title,
    icons: { icon: logoDataUrl(theme) ?? "/icon.svg" },
  };
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return children;
}
