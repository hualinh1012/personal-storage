import type { PreTokenGenerationTriggerEvent } from "aws-lambda";
import { isAllowed, parseAllowlist } from "./allowlist";

export async function handler(event: PreTokenGenerationTriggerEvent): Promise<PreTokenGenerationTriggerEvent> {
  const { email, email_verified } = event.request.userAttributes;
  if (!isAllowed(email, email_verified, parseAllowlist(process.env.ALLOWED_EMAILS))) {
    throw new Error("ACCESS_DENIED");
  }
  return event;
}
