import type { ReactNode } from "react";
import { AccessTokenType } from "@prisma/client";
import { TokenThemeScope } from "@/components/token-theme-scope";

export default async function QrLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <TokenThemeScope token={token} type={AccessTokenType.QR_QUEUE}>
      {children}
    </TokenThemeScope>
  );
}