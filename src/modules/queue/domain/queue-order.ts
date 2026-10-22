import type { QueueStatus } from "@prisma/client";

/**
 * The queue table used to be strictly chronological, which meant a busy morning
 * pushed everyone still waiting below a wall of finished tickets. Anyone
 * scanning the dashboard had to scroll past "Selesai" rows to find the person
 * standing at the counter.
 *
 * Ranking puts live work first. Within the live group the oldest ticket wins
 * (that is who is next), while finished work is shown newest-first because the
 * ticket that just finished is the one an operator is most likely to check.
 */
export const QUEUE_ATTENTION_RANK: Record<QueueStatus, number> = {
  SERVING: 0,
  CALLED: 1,
  WAITING: 2,
  SKIPPED: 3,
  NO_SHOW: 4,
  CANCELLED: 5,
  COMPLETED: 6,
};

/** Statuses that still represent someone standing in the room. */
export const LIVE_QUEUE_STATUSES: QueueStatus[] = ["WAITING", "CALLED", "SERVING"];

export function isLiveQueueStatus(status: QueueStatus) {
  return LIVE_QUEUE_STATUSES.includes(status);
}

type SortableQueue = {
  status: QueueStatus;
  issuedAt: Date | string;
};

function timeOf(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Live tickets first (oldest first), then wrapped-up tickets newest first.
 * Stable for equal timestamps so the order does not flicker between refreshes.
 */
export function compareQueuesForAttention(left: SortableQueue, right: SortableQueue) {
  const rank = QUEUE_ATTENTION_RANK[left.status] - QUEUE_ATTENTION_RANK[right.status];
  if (rank !== 0) return rank;
  const delta = timeOf(left.issuedAt) - timeOf(right.issuedAt);
  return QUEUE_ATTENTION_RANK[left.status] <= QUEUE_ATTENTION_RANK.WAITING
    ? delta
    : -delta;
}
