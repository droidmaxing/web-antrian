import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";

/** Start of the current fixed window, aligned to `windowSeconds`. */
export function windowStartFor(now: Date, windowSeconds: number) {
  return new Date(
    Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000,
  );
}

export async function enforceRateLimit(
  identity: string,
  limit: number,
  windowSeconds: number,
) {
  const key = createHash("sha256").update(identity).digest("hex");
  const windowStart = windowStartFor(new Date(), windowSeconds);

  // One atomic statement: concurrent requests for the same key cannot race into a
  // unique-constraint failure (P2002) the way upsert-then-lock did, and a new
  // window resets the counter in the same step.
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO \`RateLimitBucket\` (\`key\`, windowStarted, count)
      VALUES (${key}, ${windowStart}, 1) AS incoming
      ON DUPLICATE KEY UPDATE
        count = IF(\`RateLimitBucket\`.\`windowStarted\` = incoming.\`windowStarted\`, \`RateLimitBucket\`.\`count\` + 1, 1),
        windowStarted = incoming.\`windowStarted\`
    `,
  );

  const [bucket] = await prisma.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`SELECT count FROM \`RateLimitBucket\` WHERE \`key\` = ${key}`,
  );
  if ((bucket?.count ?? 0) > limit) {
    throw new AppError("Terlalu banyak permintaan. Coba lagi sebentar.", 429, "RATE_LIMITED");
  }
}

export function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}