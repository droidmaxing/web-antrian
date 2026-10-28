import type { MembershipRole } from "@prisma/client";

/**
 * Single source of truth for what each role may do in the interface. The API
 * enforces the same rules through `requireRole` in each service — hiding a
 * button never grants or removes access on its own, so the two must agree.
 */
export type Capability =
  /** Call, serve, complete, or cancel queue tickets. */
  | "operateQueue"
  /** Manage branches, counters, services, displays, and features. */
  | "configureBusiness"
  /** Invite teammates and change their roles or scopes. */
  | "manageTeam"
  /** Read business performance reports. */
  | "viewReports"
  /** Change the workspace colours and logo. */
  | "manageTheme";

const OWNER_CAPABILITIES: Capability[] = [
  "operateQueue",
  "configureBusiness",
  "manageTeam",
  "viewReports",
  "manageTheme",
];

const CAPABILITIES: Record<MembershipRole, Capability[]> = {
  OWNER: OWNER_CAPABILITIES,
  SUPER_ADMIN: OWNER_CAPABILITIES,
  // ADMIN runs the counter. It may read the customer directory but cannot
  // configure the business, the team, reports, or the workspace look.
  ADMIN: ["operateQueue"],
};

export function can(role: MembershipRole, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

export function capabilitiesFor(role: MembershipRole): Record<Capability, boolean> {
  const granted = CAPABILITIES[role];
  return {
    operateQueue: granted.includes("operateQueue"),
    configureBusiness: granted.includes("configureBusiness"),
    manageTeam: granted.includes("manageTeam"),
    viewReports: granted.includes("viewReports"),
    manageTheme: granted.includes("manageTheme"),
  };
}

const ROLE_LABELS: Record<MembershipRole, string> = {
  OWNER: "Owner",
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin Operasional",
};

export function roleLabel(role: MembershipRole): string {
  return ROLE_LABELS[role];
}
