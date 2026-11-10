import { describe, expect, it } from "vitest";
import { parseRetentionDays, retentionNote } from "../src/trash/retention";

describe("parseRetentionDays", () => {
  it("reads whole days from the config string", () => {
    expect(parseRetentionDays("30")).toBe(30);
    expect(parseRetentionDays(" 7 ")).toBe(7);
    expect(parseRetentionDays("1")).toBe(1);
  });

  it("is null when missing or unusable, so no wrong number is shown", () => {
    for (const raw of [undefined, null, "", "CHANGE_ME", "0", "-3", "2.5", "1e3", "30 days", 30]) {
      expect(parseRetentionDays(raw)).toBeNull();
    }
  });
});

describe("retentionNote", () => {
  it("states the retention", () => {
    expect(retentionNote(30)).toBe("Files here are removed for good 30 days after they were deleted.");
    expect(retentionNote(1)).toBe("Files here are removed for good 1 day after they were deleted.");
  });

  it("says nothing when the retention isn't known", () => {
    expect(retentionNote(null)).toBeNull();
  });
});
