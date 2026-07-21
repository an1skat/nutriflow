import { describe, expect, it } from "vitest";

import { createObjectId } from "./ObjectId";

describe("createObjectId", () => {
  it("creates distinct PydanticObjectId-compatible values", () => {
    const ids = [createObjectId(), createObjectId()];

    expect(ids[0]).toMatch(/^[0-9a-f]{24}$/);
    expect(ids[1]).toMatch(/^[0-9a-f]{24}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
