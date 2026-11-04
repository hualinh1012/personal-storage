import type { PreSignUpTriggerEvent } from "aws-lambda";
import { isAllowed, parseAllowlist } from "./allowlist";

export async function handler(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
  const { email, email_verified } = event.request.userAttributes;
  const allowed =
    event.triggerSource === "PreSignUp_ExternalProvider" &&
    isAllowed(email, email_verified, parseAllowlist(process.env.ALLOWED_EMAILS));
  if (!allowed) throw new Error("ACCESS_DENIED");
  return event;
}
