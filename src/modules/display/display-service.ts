import { randomBytes } from "node:crypto";
import { QueueStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/modules/shared/errors";
import { requireFeature } from "@/modules/feature/feature-gate";
import { getTheme } from "@/modules/tenancy/theme-service";
import { clientAddress, enforceRateLimit } from "@/modules/shared/rate-limit";
import { hashAccessToken } from "@/modules/queue/application/public-queue";
import { dateForTimezone } from "@/modules/queue/domain/service-date";
import { isEventVisibleOnDisplay } from "@/modules/display/domain/display-scope";
import { WAITING_FETCH_LIMIT } from "@/modules/display/domain/waiting-pages";
import { BusinessContext, requireRole } from "@/modules/tenancy/context";

/**
 * A display scoped to counters must only reference counters inside its own
 * branch, otherwise a TV in one lobby would announce another lobby's tickets.
 */
async function assertCountersInBranch(branchId: string, counterIds: string[]) {
  const unique = [...new Set(counterIds)];
  if (!unique.length) return unique;
  const counters = await prisma.counter.findMany({
    where: { id: { in: unique }, branchId },
    select: { id: true },
  });
  if (counters.length !== unique.length) {
    throw new AppError("Loket yang dipilih tidak valid untuk cabang ini.", 400, "INVALID_COUNTER");
  }
  return unique;
}

export async function createDisplay(
  context: BusinessContext,
  branchId: string,
  name: string,
  counterIds: string[] = [],
) {
  requireRole(context, ["SUPER_ADMIN"]);
  const branch = await prisma.branch.findFirst({
    where: {
      id: branchId,
      businessId: context.businessId,
      ...(context.branchIds ? { id: { in: context.branchIds } } : {}),
      active: true,
    },
    select: { id: true },
  });
  if (!branch) throw new AppError("Cabang tidak ditemukan.", 404, "BRANCH_NOT_FOUND");
  await requireFeature(context.businessId, "TV_DISPLAY");
  const scopedCounterIds = await assertCountersInBranch(branchId, counterIds);

  const token = randomBytes(32).toString("base64url");
  const display = await prisma.$transaction(async (tx) => {
    const created = await tx.display.create({
      data: {
        businessId: context.businessId,
        branchId,
        name,
        tokenHash: hashAccessToken(token),
        counters: {
          create: scopedCounterIds.map((counterId) => ({ counterId })),
        },
      },
      select: { id: true, branchId: true, name: true, createdAt: true },
    });
    await tx.auditLog.create({
      data: {
        businessId: context.businessId,
        actorUserId: context.userId,
        branchId,
        action: "DISPLAY_CREATED",
        targetType: "Display",
        targetId: created.id,
      },
    });
    return created;
  });

  return { display, token };
}

export async function renameDisplay(
  context: BusinessContext,
  displayId: string,
  name: string,
) {
  requireRole(context, ["SUPER_ADMIN"]);
  const display = await findScopedDisplay(context, displayId);
  const updated = await prisma.display.update({
    where: { id: display.id },
    data: { name },
    select: { id: true, branchId: true, name: true, active: true },
  });
  await prisma.auditLog.create({
    data: {
      businessId: context.businessId,
      actorUserId: context.userId,
      branchId: display.branchId,
      action: "DISPLAY_RENAMED",
      targetType: "Display",
      targetId: display.id,
    },
  });
  return updated;
}

/**
 * Displays hold a hashed access token. Rotating replaces the hash, which
 * instantly revokes every screen still using the old URL.
 */
export async function rotateDisplayToken(context: BusinessContext, displayId: string) {
  requireRole(context, ["SUPER_ADMIN"]);
  const display = await findScopedDisplay(context, displayId);
  await requireFeature(context.businessId, "TV_DISPLAY");
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.display.update({
      where: { id: display.id },
      data: { tokenHash: hashAccessToken(token) },
    });
    await tx.auditLog.create({
      data: {
        businessId: context.businessId,
        actorUserId: context.userId,
        branchId: display.branchId,
        action: "DISPLAY_TOKEN_ROTATED",
        targetType: "Display",
        targetId: display.id,
      },
    });
  });
  return { displayId: display.id, token };
}

/**
 * A display is only a pairing token, so deleting it leaves no orphan history.
 * We still prefer deactivation when the caller asks for it, because an
 * accidentally removed screen means a physical trip to the lobby.
 */
export async function deleteDisplay(context: BusinessContext, displayId: string) {
  requireRole(context, ["SUPER_ADMIN"]);
  const display = await findScopedDisplay(context, displayId);
  await prisma.$transaction(async (tx) => {
    await tx.display.delete({ where: { id: display.id } });
    await tx.auditLog.create({
      data: {
        businessId: context.businessId,
        actorUserId: context.userId,
        branchId: display.branchId,
        action: "DISPLAY_DELETED",
        targetType: "Display",
        targetId: display.id,
      },
    });
  });
  return { id: display.id };
}

export async function setDisplayActive(
  context: BusinessContext,
  displayId: string,
  active: boolean,
) {
  requireRole(context, ["SUPER_ADMIN"]);
  const display = await findScopedDisplay(context, displayId);
  const updated = await prisma.display.update({
    where: { id: display.id },
    data: { active },
    select: { id: true, branchId: true, name: true, active: true },
  });
  await prisma.auditLog.create({
    data: {
      businessId: context.businessId,
      actorUserId: context.userId,
      branchId: display.branchId,
      action: active ? "DISPLAY_ACTIVATED" : "DISPLAY_DEACTIVATED",
      targetType: "Display",
      targetId: display.id,
    },
  });
  return updated;
}

/**
 * Choosing the counters a screen covers. An empty list is meaningful: it turns
 * the screen back into a lobby display that shows every counter.
 */
export async function setDisplayCounters(
  context: BusinessContext,
  displayId: string,
  counterIds: string[],
) {
  requireRole(context, ["SUPER_ADMIN"]);
  const display = await findScopedDisplay(context, displayId);
  const unique = await assertCountersInBranch(display.branchId, counterIds);
  await prisma.$transaction(async (tx) => {
    await tx.displayCounter.deleteMany({ where: { displayId: display.id } });
    if (unique.length) {
      await tx.displayCounter.createMany({
        data: unique.map((counterId) => ({ displayId: display.id, counterId })),
      });
    }
    await tx.auditLog.create({
      data: {
        businessId: context.businessId,
        actorUserId: context.userId,
        branchId: display.branchId,
        action: "DISPLAY_SCOPE_UPDATED",
        targetType: "Display",
        targetId: display.id,
        metadata: { counterIds: unique },
      },
    });
  });
  return { id: display.id, counterIds: unique };
}

async function findScopedDisplay(context: BusinessContext, displayId: string) {
  const display = await prisma.display.findFirst({
    where: {
      id: displayId,
      businessId: context.businessId,
      ...(context.branchIds ? { branchId: { in: context.branchIds } } : {}),
    },
    select: { id: true, branchId: true, name: true },
  });
  if (!display) {
    throw new AppError("Display tidak ditemukan.", 404, "DISPLAY_NOT_FOUND");
  }
  return display;
}

export async function resolveDisplayToken(token: string) {
  const display = await prisma.display.findUnique({
    where: { tokenHash: hashAccessToken(token) },
    include: {
      business: { select: { id: true, name: true, active: true, timezone: true } },
      branch: { select: { id: true, name: true, active: true, timezone: true } },
      counters: { select: { counterId: true } },
    },
  });
  if (
    !display ||
    !display.active ||
    !display.business.active ||
    !display.branch.active
  ) {
    throw new AppError("Display tidak ditemukan atau tidak aktif.", 404, "INVALID_DISPLAY_TOKEN");
  }
  await requireFeature(display.business.id, "TV_DISPLAY");
  return display;
}

export async function getDisplaySnapshot(token: string, request: Request) {
  const display = await resolveDisplayToken(token);
  await enforceRateLimit(
    `display-snapshot:${display.id}:${clientAddress(request)}`,
    120,
    60,
  );
  const timezone = display.branch.timezone ?? display.business.timezone;
  // No scoped counters means the screen is a lobby screen showing everything.
  const counterIds = display.counters.map((row) => row.counterId);
  const counterScope = counterIds.length
    ? { counterId: { in: counterIds } }
    : {};
  const queues = await prisma.queue.findMany({
    where: {
      businessId: display.businessId,
      branchId: display.branchId,
      // Without this, a queue left uncompleted yesterday stays on the TV forever.
      serviceDate: dateForTimezone(timezone),
      status: { in: ["CALLED", "SERVING"] },
      ...counterScope,
    },
    include: {
      service: { select: { name: true } },
      counter: { select: { name: true, code: true } },
    },
    orderBy: [{ calledAt: "desc" }, { issuedAt: "desc" }],
    take: 8,
  });

  // A lobby screen is more useful when it also answers "how long until my
  // number?" — so the waiting list is part of the snapshot, not a second call.
  // Waiting tickets have no counter yet, so a scoped screen filters them by the
  // services its counters actually serve instead.
  const waitingWhere = {
    businessId: display.businessId,
    branchId: display.branchId,
    serviceDate: dateForTimezone(timezone),
    status: QueueStatus.WAITING,
    ...(counterIds.length
      ? { service: { counterServices: { some: { counterId: { in: counterIds } } } } }
      : {}),
  };
  // On a busy day the queue is longer than one screenful, so the screen needs
  // several pages of data plus the real total to stay honest about how many
  // people are still waiting.
  const [waitingTotal, waiting] = await Promise.all([
    prisma.queue.count({ where: waitingWhere }),
    prisma.queue.findMany({
      where: waitingWhere,
      include: { service: { select: { name: true } } },
      orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
      take: WAITING_FETCH_LIMIT,
    }),
  ]);
  const features = await prisma.featureConfiguration.findMany({
    where: {
      businessId: display.businessId,
      featureKey: { in: ["VOICE_CALL", "ADVERTISEMENT"] },
    },
    select: { featureKey: true, enabled: true },
  });
  return {
    theme: await getTheme(display.businessId),
    display: {
      name: display.name,
      branch: display.branch.name,
      business: display.business.name,
      // Lets the TV tell the audience whether it covers the whole lobby or a
      // single counter, instead of silently looking incomplete.
      scope: (counterIds.length ? "counter" : "branch") as "counter" | "branch",

      counterCount: counterIds.length || undefined,
    },
    queues: queues.map((queue) => ({
      ticketNumber: queue.ticketNumber,
      status: queue.status,
      service: queue.service.name,
      counter: queue.counter?.name ?? "—",
      counterCode: queue.counter?.code ?? "",
    })),
    waitingTotal,
    waiting: waiting.map((queue) => ({
      ticketNumber: queue.ticketNumber,
      service: queue.service.name,
      issuedAt: queue.issuedAt.toISOString(),
      // Position in the line for this service, so the TV can show "3 lagi".
      ahead: waiting.filter(
        (other) =>
          other.serviceId === queue.serviceId &&
          other.issuedAt.getTime() < queue.issuedAt.getTime(),
      ).length,
    })),
    voiceEnabled: features.find((feature) => feature.featureKey === "VOICE_CALL")?.enabled ?? false,
    advertisementEnabled: features.find((feature) => feature.featureKey === "ADVERTISEMENT")?.enabled ?? false,
    cursor: new Date().toISOString(),
  };
}

export async function getDisplayEvents(
  token: string,
  after: string,
) {
  const display = await resolveDisplayToken(token);
  const counterIds = display.counters.map((row) => row.counterId);
  const events = await queryDisplayEvents(display.branchId, after);
  // Snapshot is already scoped per counter; the event feed must be too, or a
  // screen in front of counter 01 announces counter 02's tickets after load.
  return events.filter((event) => isEventVisibleOnDisplay(event.payload, counterIds));
}

async function queryDisplayEvents(branchId: string, after: string) {
  const cursorParts = after.split("|");
  const cursorDate = new Date(cursorParts[0]);
  const cursorId = cursorParts[1] ?? "";
  if (Number.isNaN(cursorDate.getTime())) {
    throw new AppError("Kursor event tidak valid.", 400, "INVALID_CURSOR");
  }

  const events = await prisma.outboxEvent.findMany({
    where: {
      branchId,
      createdAt: {
        gte: cursorDate,
      },
      OR: [
        { createdAt: { gt: cursorDate } },
        { createdAt: cursorDate, id: { gt: cursorId } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      createdAt: true,
      eventType: true,
      payload: true,
    },
  });
  return events.map((event) => ({
    id: `${event.createdAt.toISOString()}|${event.id}`,
    type: event.eventType,
    payload: event.payload,
  }));
}

export async function getDisplayEventStream(
  token: string,
  request: Request,
  after: string,
) {
  const display = await resolveDisplayToken(token);
  await enforceRateLimit(
    `display-stream:${display.id}:${clientAddress(request)}`,
    12,
    60,
  );
  const encoder = new TextEncoder();
  let cursor = after || new Date().toISOString();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      request.signal.addEventListener("abort", close, { once: true });

      void (async () => {
        try {
          while (!closed) {
            await requireFeature(display.business.id, "TV_DISPLAY");
            // Re-read the scope every tick: an operator adding or removing a
            // counter on a live screen must take effect immediately, and this
            // stream stays open for hours.
            const scopedCounterIds = (
              await prisma.displayCounter.findMany({
                where: { displayId: display.id },
                select: { counterId: true },
              })
            ).map((row) => row.counterId);
            const events = await queryDisplayEvents(display.branchId, cursor);
            for (const event of events) {
              // Always advance past every event, even a filtered one: the cursor
              // is the only thing keeping old events from being re-read forever.
              cursor = event.id;
              if (!isEventVisibleOnDisplay(event.payload, scopedCounterIds)) continue;
              controller.enqueue(
                encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`),
              );
            }
            if (!events.length) {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
            }
            const voiceFeature = await prisma.featureConfiguration.findUnique({
              where: {
                businessId_featureKey: {
                  businessId: display.business.id,
                  featureKey: "VOICE_CALL",
                },
              },
              select: { enabled: true },
            });
            controller.enqueue(
              encoder.encode(
                `event: capabilities\ndata: ${JSON.stringify({ voiceEnabled: voiceFeature?.enabled ?? false })}\n\n`,
              ),
            );
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error("TV display event stream failed", {
            displayId: display.id,
            error,
          });
          if (!closed) {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ message: "Koneksi display terganggu." })}\n\n`,
              ),
            );
            close();
          }
        }
      })();
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
