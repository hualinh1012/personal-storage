import type { PreTokenGenerationTriggerEvent } from "aws-lambda";
import { isAllowed, parseAllowlist } from "./allowlist";
import { accessClaims, accessFor, parseAccess } from "./access";

export async function handler(event: PreTokenGenerationTriggerEvent): Promise<PreTokenGenerationTriggerEvent> {
  const { email, email_verified } = event.request.userAttributes;
  if (!isAllowed(email, email_verified, parseAllowlist(process.env.ALLOWED_EMAILS))) {
    throw new Error("ACCESS_DENIED");
  }
  // Access claims become principal tags that the Identity Pool role checks
  // (infra/identity.tf). A malformed ACCESS_LEVELS throws, so nobody gets a
  // token until it's fixed; Terraform validates it before deploying anyway.
  const access = accessFor(email, parseAccess(process.env.ACCESS_LEVELS));
  event.response = {
    ...event.response,
    claimsOverrideDetails: {
      ...event.response?.claimsOverrideDetails,
      claimsToAddOrOverride: {
        ...event.response?.claimsOverrideDetails?.claimsToAddOrOverride,
        ...accessClaims(access),
      },
    },
  };
  return event;
}
