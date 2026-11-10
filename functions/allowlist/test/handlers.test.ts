import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PreSignUpTriggerEvent, PreTokenGenerationTriggerEvent } from "aws-lambda";
import { handler as preSignUp } from "../src/preSignUp";
import { handler as preTokenGeneration } from "../src/preTokenGeneration";

function signUpEvent(triggerSource: string, email: string, verified = "true"): PreSignUpTriggerEvent {
  return {
    triggerSource,
    request: { userAttributes: { email, email_verified: verified } },
    response: {},
  } as unknown as PreSignUpTriggerEvent;
}

function tokenEvent(triggerSource: string, email: string, verified = "true"): PreTokenGenerationTriggerEvent {
  return {
    triggerSource,
    request: { userAttributes: { email, email_verified: verified } },
    response: {},
  } as unknown as PreTokenGenerationTriggerEvent;
}

beforeEach(() => {
  process.env.ALLOWED_EMAILS = "mom@gmail.com";
});
afterEach(() => {
  delete process.env.ALLOWED_EMAILS;
});

describe("preSignUp", () => {
  it("allows an allowlisted external (Google) user and returns the event", async () => {
    const event = signUpEvent("PreSignUp_ExternalProvider", "Mom@gmail.com");
    await expect(preSignUp(event)).resolves.toBe(event);
  });
  it("denies an external user not on the allowlist", async () => {
    await expect(preSignUp(signUpEvent("PreSignUp_ExternalProvider", "stranger@gmail.com"))).rejects.toThrow("ACCESS_DENIED");
  });
  it("denies native sign-up even for an allowlisted email", async () => {
    await expect(preSignUp(signUpEvent("PreSignUp_SignUp", "mom@gmail.com"))).rejects.toThrow("ACCESS_DENIED");
  });
  it("denies an allowlisted Google user whose email isn't verified", async () => {
    await expect(preSignUp(signUpEvent("PreSignUp_ExternalProvider", "mom@gmail.com", "false"))).rejects.toThrow("ACCESS_DENIED");
  });
  it("denies everyone when ALLOWED_EMAILS is not set at all", async () => {
    delete process.env.ALLOWED_EMAILS;
    await expect(preSignUp(signUpEvent("PreSignUp_ExternalProvider", "mom@gmail.com"))).rejects.toThrow("ACCESS_DENIED");
    await expect(preTokenGeneration(tokenEvent("TokenGeneration_HostedAuth", "mom@gmail.com"))).rejects.toThrow("ACCESS_DENIED");
  });
});

describe("preTokenGeneration", () => {
  it("allows an allowlisted user on hosted auth", async () => {
    const event = tokenEvent("TokenGeneration_HostedAuth", "mom@gmail.com");
    await expect(preTokenGeneration(event)).resolves.toBe(event);
  });
  it("denies a removed person on token refresh", async () => {
    process.env.ALLOWED_EMAILS = "";
    await expect(preTokenGeneration(tokenEvent("TokenGeneration_RefreshTokens", "mom@gmail.com"))).rejects.toThrow("ACCESS_DENIED");
  });
  it("denies an unverified email", async () => {
    await expect(preTokenGeneration(tokenEvent("TokenGeneration_HostedAuth", "mom@gmail.com", "false"))).rejects.toThrow("ACCESS_DENIED");
  });
});

describe("preTokenGeneration access claims", () => {
  const claims = async (email: string) => {
    const event = await preTokenGeneration(tokenEvent("TokenGeneration_HostedAuth", email));
    return event.response.claimsOverrideDetails?.claimsToAddOrOverride;
  };

  afterEach(() => {
    delete process.env.ACCESS_LEVELS;
  });

  it("adds the person's access level as ID-token claims", async () => {
    process.env.ACCESS_LEVELS = JSON.stringify({ "mom@gmail.com": { global: "write", personal: true, trash: true } });
    expect(await claims("Mom@gmail.com")).toEqual({ global_access: "write", personal: "yes", trash: "yes" });
  });

  it("gives an allowlisted email with no entry read-only Global/, no personal folder, no Deleted folder", async () => {
    process.env.ACCESS_LEVELS = JSON.stringify({ "dad@gmail.com": { global: "write" } });
    expect(await claims("mom@gmail.com")).toEqual({ global_access: "read", personal: "no", trash: "no" });
  });

  it("uses the default when ACCESS_LEVELS is not set", async () => {
    expect(await claims("mom@gmail.com")).toEqual({ global_access: "read", personal: "no", trash: "no" });
  });

  it("still denies people who aren't allowlisted, even with an access entry", async () => {
    process.env.ACCESS_LEVELS = JSON.stringify({ "stranger@gmail.com": { global: "write" } });
    await expect(preTokenGeneration(tokenEvent("TokenGeneration_HostedAuth", "stranger@gmail.com"))).rejects.toThrow("ACCESS_DENIED");
  });

  it("fails rather than guessing when ACCESS_LEVELS is malformed", async () => {
    process.env.ACCESS_LEVELS = "CHANGE_ME";
    await expect(claims("mom@gmail.com")).rejects.toThrow(/not valid JSON/);
  });
});
