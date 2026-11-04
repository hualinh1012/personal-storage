import { describe, expect, it } from "vitest";
import { isAllowed, parseAllowlist } from "../src/allowlist";

describe("parseAllowlist", () => {
  it("trims, lower-cases and drops empty entries", () => {
    expect(parseAllowlist(" Mom@Gmail.com, linh@gmail.com ,,")).toEqual(["mom@gmail.com", "linh@gmail.com"]);
  });
  it("returns [] for undefined or empty", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist("")).toEqual([]);
  });
});

describe("isAllowed", () => {
  const list = ["mom@gmail.com"];
  it("allows verified listed emails, case-insensitively", () => {
    expect(isAllowed("MOM@gmail.com", "true", list)).toBe(true);
    expect(isAllowed("mom@gmail.com", true, list)).toBe(true);
  });
  it("denies unverified or missing verification", () => {
    expect(isAllowed("mom@gmail.com", "false", list)).toBe(false);
    expect(isAllowed("mom@gmail.com", undefined, list)).toBe(false);
  });
  it("denies unlisted or missing email", () => {
    expect(isAllowed("stranger@gmail.com", "true", list)).toBe(false);
    expect(isAllowed(undefined, "true", list)).toBe(false);
  });
  it("denies everyone with an empty list", () => {
    expect(isAllowed("mom@gmail.com", "true", [])).toBe(false);
  });
});
