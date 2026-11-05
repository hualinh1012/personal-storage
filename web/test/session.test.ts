import { describe, expect, it } from "vitest";
import { emailFromIdTokenPayload } from "../src/session";

describe("emailFromIdTokenPayload", () => {
  it("returns the email claim", () => {
    expect(emailFromIdTokenPayload({ email: "mom@gmail.com", sub: "abc" })).toBe("mom@gmail.com");
  });

  it("returns an empty string when the claim is missing or not a string", () => {
    expect(emailFromIdTokenPayload(undefined)).toBe("");
    expect(emailFromIdTokenPayload({ sub: "abc" })).toBe("");
    expect(emailFromIdTokenPayload({ email: 42 })).toBe("");
  });
});
