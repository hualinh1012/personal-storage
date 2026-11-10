import { describe, expect, it } from "vitest";
import { READ_ONLY, accessFromIdTokenPayload } from "../src/access";
import { mockAccess } from "../src/playground/mockDrive";

describe("accessFromIdTokenPayload", () => {
  it("reads the claims the pre token generation trigger adds", () => {
    expect(accessFromIdTokenPayload({ global_access: "write", personal: "yes", trash: "yes" })).toEqual({
      globalWrite: true,
      personal: true,
      trash: true,
    });
    expect(accessFromIdTokenPayload({ global_access: "read", personal: "yes", trash: "no" })).toEqual({
      globalWrite: false,
      personal: true,
      trash: false,
    });
    expect(accessFromIdTokenPayload({ global_access: "read", personal: "no", trash: "no" })).toEqual(READ_ONLY);
  });

  it("is read-only with no personal or Deleted folder when the claims are missing or odd, like IAM", () => {
    expect(accessFromIdTokenPayload(undefined)).toEqual(READ_ONLY);
    expect(accessFromIdTokenPayload({ email: "a@x.com" })).toEqual(READ_ONLY);
    expect(accessFromIdTokenPayload({ global_access: "WRITE", personal: true, trash: true })).toEqual(READ_ONLY);
  });
});

describe("playground mockAccess", () => {
  it("defaults to full access and parses ?access=", () => {
    expect(mockAccess(null)).toEqual({ globalWrite: true, personal: true, trash: true });
    expect(mockAccess("read")).toEqual(READ_ONLY);
    // URLSearchParams turns "+" into a space.
    expect(mockAccess("read personal")).toEqual({ globalWrite: false, personal: true, trash: false });
    expect(mockAccess("write")).toEqual({ globalWrite: true, personal: false, trash: false });
    expect(mockAccess("read trash")).toEqual({ globalWrite: false, personal: false, trash: true });
  });
});
