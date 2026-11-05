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

  it("falls back to clearing local Amplify tokens and reloading the landing page", async () => {
    signOut.mockRejectedValue(new Error("network"));
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const store = new Map<string, string>([
      ["CognitoIdentityServiceProvider.client.user.idToken", "x"],
      ["com.amplify.Cognito.ap-southeast-1:pool.identityId", "y"],
      ["unrelated", "keep"],
    ]);
    vi.stubGlobal("localStorage", {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      removeItem: (k: string) => store.delete(k),
    });

    await signOutSafely();

    expect([...store.keys()]).toEqual(["unrelated"]);
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
