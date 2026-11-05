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
