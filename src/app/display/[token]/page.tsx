import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDisplaySnapshot } from "@/modules/display/display-service";
import { AppError } from "@/modules/shared/errors";
import { requestFromHeaders } from "@/lib/app-url";
import { TvDisplay } from "@/components/tv-display";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export default async function DisplayPage({ params }: PageProps) {
  const { token } = await params;
  let snapshot;
  try {
    snapshot = await getDisplaySnapshot(token, requestFromHeaders(await headers()));
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  return <TvDisplay token={token} snapshot={snapshot} />;
}
