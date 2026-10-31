import assert from "node:assert/strict";
import test from "node:test";
import {
  businessSlugBase,
  registrationSchema,
  workspaceSchema,
} from "../src/modules/tenancy/registration-service";

test("registration normalizes email and trims display names", () => {
  const parsed = registrationSchema.safeParse({
    name: "  Anisa  ",
    companyName: "  Klinik Sehat  ",
    email: "  ANISA@example.com  ",
    password: "a-secure-password",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.name, "Anisa");
    assert.equal(parsed.data.companyName, "Klinik Sehat");
    assert.equal(parsed.data.email, "anisa@example.com");
  }
});

test("registration rejects short passwords and malformed email", () => {
  assert.equal(registrationSchema.safeParse({
    name: "Anisa", companyName: "Klinik Sehat", email: "nope", password: "short",
  }).success, false);
});

test("workspace schema trims the business name and rejects empty input", () => {
  const parsed = workspaceSchema.safeParse({ companyName: "  Klinik Sehat  " });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.companyName, "Klinik Sehat");

  assert.equal(workspaceSchema.safeParse({ companyName: " a " }).success, false);
  assert.equal(workspaceSchema.safeParse({}).success, false);
});

test("slug base stays URL-safe, accent-free, and never empty", () => {
  assert.equal(businessSlugBase("Klinik Sehat Sentosa"), "klinik-sehat-sentosa");
  assert.equal(businessSlugBase("Áé Café & Co"), "ae-cafe-co");
  assert.equal(businessSlugBase("  !!  "), "bisnis");
  assert.equal(businessSlugBase("x".repeat(60)).length, 40);
});
