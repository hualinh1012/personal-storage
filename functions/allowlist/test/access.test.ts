import { describe, expect, it } from "vitest";
import { DEFAULT_ACCESS, accessClaims, accessFor, parseAccess } from "../src/access";

describe("parseAccess", () => {
  it("parses entries keyed by lower-cased, trimmed email; missing flags are false", () => {
    const map = parseAccess(
      JSON.stringify({
        "A@x.com ": { global: "write", personal: true },
        "b@x.com": { global: "read" },
        "c@x.com": { global: "read", personal: true },
      }),
    );
    expect([...map.entries()]).toEqual([
      ["a@x.com", { global: "write", personal: true }],
      ["b@x.com", { global: "read", personal: false }],
      ["c@x.com", { global: "read", personal: true }],
    ]);
  });

  it("returns an empty map for undefined, empty or {}", () => {
    expect(parseAccess(undefined).size).toBe(0);
    expect(parseAccess("  ").size).toBe(0);
    expect(parseAccess("{}").size).toBe(0);
  });

  it("rejects invalid JSON, including the CHANGE_ME placeholder", () => {
    expect(() => parseAccess("CHANGE_ME")).toThrow(/not valid JSON/);
    expect(() => parseAccess('{"a@x.com": {')).toThrow(/not valid JSON/);
  });

  it("rejects a root that isn't an object", () => {
    expect(() => parseAccess("[]")).toThrow(/JSON object/);
    expect(() => parseAccess('"a@x.com"')).toThrow(/JSON object/);
    expect(() => parseAccess("null")).toThrow(/JSON object/);
  });

  it("rejects the same email twice in different case", () => {
    expect(() => parseAccess('{"a@x.com": {"global": "read"}, "A@X.com": {"global": "write"}}')).toThrow(/more than once/);
  });

  it("rejects an empty email", () => {
    expect(() => parseAccess('{" ": {"global": "read"}}')).toThrow(/empty email/);
  });

  it("rejects bad entries", () => {
    expect(() => parseAccess('{"a@x.com": "write"}')).toThrow(/must be an object/);
    expect(() => parseAccess('{"a@x.com": {}}')).toThrow(/"global"/);
    expect(() => parseAccess('{"a@x.com": {"global": "admin"}}')).toThrow(/"global"/);
    expect(() => parseAccess('{"a@x.com": {"global": "read", "personal": "yes"}}')).toThrow(/true or false/);
    expect(() => parseAccess('{"a@x.com": {"global": "read", "admin": true}}')).toThrow(/unknown key "admin"/);
  });
});

describe("accessFor", () => {
  const map = parseAccess('{"a@x.com": {"global": "write", "personal": true}}');

  it("finds an entry case-insensitively", () => {
    expect(accessFor(" A@X.com", map)).toEqual({ global: "write", personal: true });
  });

  it("defaults to read-only Global/ with no personal folder", () => {
    expect(accessFor("b@x.com", map)).toEqual({ global: "read", personal: false });
    expect(DEFAULT_ACCESS).toEqual({ global: "read", personal: false });
  });
});

describe("accessClaims", () => {
  it("turns the access into string claims", () => {
    expect(accessClaims({ global: "write", personal: true })).toEqual({ global_access: "write", personal: "yes" });
    expect(accessClaims({ global: "read", personal: false })).toEqual({ global_access: "read", personal: "no" });
  });
});
