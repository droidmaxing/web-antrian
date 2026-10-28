import assert from "node:assert/strict";
import test from "node:test";
import { can, capabilitiesFor, roleLabel } from "../src/modules/tenancy/access";
import { guideHref, guideSections } from "../src/modules/guide/guide-content";

const ROLES = ["OWNER", "SUPER_ADMIN", "ADMIN"] as const;

test("only owners and super admins may configure, manage the team, read reports, or theme", () => {
  for (const capability of [
    "configureBusiness",
    "manageTeam",
    "viewReports",
    "manageTheme",
  ] as const) {
    assert.equal(can("OWNER", capability), true, `OWNER/${capability}`);
    assert.equal(can("SUPER_ADMIN", capability), true, `SUPER_ADMIN/${capability}`);
    // The interface must not show these to an operator, and the same rule is
    // what requireRole checks on the server.
    assert.equal(can("ADMIN", capability), false, `ADMIN/${capability}`);
  }
  for (const role of ROLES) {
    assert.equal(can(role, "operateQueue"), true, `${role}/operateQueue`);
  }
});

test("capabilitiesFor mirrors the capability matrix", () => {
  for (const role of ROLES) {
    const flags = capabilitiesFor(role);
    for (const [capability, granted] of Object.entries(flags)) {
      assert.equal(granted, can(role, capability as keyof typeof flags), `${role}/${capability}`);
    }
  }
  assert.deepEqual(capabilitiesFor("ADMIN"), {
    operateQueue: true,
    configureBusiness: false,
    manageTeam: false,
    viewReports: false,
    manageTheme: false,
  });
});

test("roles carry a human label", () => {
  assert.equal(roleLabel("SUPER_ADMIN"), "Super Admin");
  assert.equal(roleLabel("ADMIN"), "Admin Operasional");
});

test("the tutorial hides steps a role cannot perform", () => {
  const adminSteps = guideSections({
    role: "ADMIN",
    enabledFeatures: ["BOOKING", "TV_DISPLAY"],
  }).flatMap((section) => section.steps);
  assert.ok(adminSteps.length > 0, "an operator still needs the basics");
  for (const step of adminSteps) {
    assert.equal(step.requires, undefined, `ADMIN must not be told to do: ${step.title}`);
  }
  const ownerSteps = guideSections({
    role: "OWNER",
    enabledFeatures: ["BOOKING", "TV_DISPLAY"],
  }).flatMap((section) => section.steps);
  assert.ok(
    ownerSteps.some((step) => step.requires === "manageTheme"),
    "the owner must see how to change the theme",
  );
  assert.ok(ownerSteps.length > adminSteps.length);
});

test("the tutorial hides steps for disabled features", () => {
  const titles = (enabledFeatures: string[]) =>
    guideSections({ role: "OWNER", enabledFeatures: enabledFeatures as never })
      .flatMap((section) => section.steps)
      .map((step) => step.title);
  assert.ok(titles(["BOOKING"]).includes("Periksa booking hari ini"));
  assert.ok(!titles(["TV_DISPLAY"]).includes("Periksa booking hari ini"));
  assert.ok(!titles([]).includes("Pasang layar TV"));
});

test("tutorial links resolve into the workspace", () => {
  const sections = guideSections({
    role: "OWNER",
    enabledFeatures: ["BOOKING", "TV_DISPLAY"],
  });
  for (const section of sections) {
    for (const step of section.steps) {
      if (!step.href) continue;
      const href = guideHref(step.href, "warung kopi");
      assert.ok(href.startsWith("/dashboard/warung%20kopi"), href);
      assert.ok(!href.includes("${slug}"));
    }
  }
});
