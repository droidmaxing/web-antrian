import assert from "node:assert/strict";
import test from "node:test";
import { platformListQuerySchema } from "../src/modules/platform/platform-service";

test("platform list query defaults to the first page and 20 rows", () => {
  assert.deepEqual(platformListQuerySchema.parse({}), { page: 1, pageSize: 20 });
});

test("platform list query accepts bounded pagination", () => {
  assert.deepEqual(platformListQuerySchema.parse({ page: "3", pageSize: "50" }), {
    page: 3,
    pageSize: 50,
  });
});

test("platform list query rejects invalid or excessive pagination", () => {
  for (const query of [{ page: "0" }, { pageSize: "101" }, { page: "many" }]) {
    assert.equal(platformListQuerySchema.safeParse(query).success, false);
  }
});
