import type { ReactNode } from "react";
import type { AccessTokenType } from "@prisma/client";
import { brandVars } from "@/modules/tenancy/brand";
import { getThemeForToken } from "@/modules/tenancy/theme-service";

/**
 * Puts a public token route under its business's colours. Server pages set the
 * same variables themselves, but an error boundary replaces the page, so the
 * scope has to live one level up for error/not-found screens to stay branded.
 */
export async function TokenThemeScope({
  token,
  type,
  children,
}: {
  token: string;
  type: AccessTokenType;
  children: ReactNode;
}) {
  const theme = await getThemeForToken(token, type);
  return <div style={brandVars(theme)}>{children}</div>;
}