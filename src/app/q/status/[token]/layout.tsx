import type { ReactNode } from "react";
import { AccessTokenType } from "@prisma/client";
import { TokenThemeScope } from "@/components/token-theme-scope";

export default async function QueueStatusLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <TokenThemeScope token={token} type={AccessTokenType.QUEUE_STATUS}>
      {children}
    </TokenThemeScope>
  );
}