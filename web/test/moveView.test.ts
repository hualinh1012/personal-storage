import { describe, expect, it } from "vitest";
import { failureLines, summary } from "../src/move/MoveView";

describe("move summary", () => {
  it("counts moved, not moved and canceled files", () => {
    expect(summary({ COMPLETE: 3 })).toBe("3 moved.");
    expect(summary({ COMPLETE: 1, FAILED: 2, CANCELED: 1 })).toBe("1 moved, 2 not moved, 1 canceled.");
  });

  it("lists each failed file by name with its reason", () => {
    const lines = failureLines([
      { data: { sourceKey: "Global/a/photo.jpg" }, status: "FAILED", message: "A file with this name already exists in the destination." },
      { data: { sourceKey: "Global/a/ok.jpg" }, status: "COMPLETE" },
      { data: { sourceKey: "Global/a/x.pdf" }, status: "FAILED" },
    ]);
    expect(lines).toEqual(["photo.jpg: A file with this name already exists in the destination.", "x.pdf: Not moved."]);
  });
});
