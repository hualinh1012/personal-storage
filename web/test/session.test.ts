import { afterEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
vi.mock("aws-amplify/auth", () => ({ signOut: () => signOut(), fetchAuthSession: vi.fn() }));

import { emailFromIdTokenPayload, signOutSafely } from "../src/session";

describe("signOutSafely", () => {
  afterEach(() => {
    signOut.mockReset();
    vi.unstubAllGlobals();
  });

  it("signs out through Amplify", async () => {
    signOut.mockResolvedValue(undefined);
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    await signOutSafely();
    expect(signOut).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it("falls back to reloading the landing page if sign-out fails", async () => {
    signOut.mockRejectedValue(new Error("network"));
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    await signOutSafely();
    expect(assign).toHaveBeenCalledWith("/");
  });
});

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
