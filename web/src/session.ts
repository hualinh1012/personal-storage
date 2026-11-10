import { fetchAuthSession, signOut } from "aws-amplify/auth";
import { accessFromIdTokenPayload, type Access } from "./access";

// localStorage key prefixes Amplify v6 uses for Cognito tokens and Identity Pool data.
const AMPLIFY_KEY_PREFIXES = ["CognitoIdentityServiceProvider.", "com.amplify."];

/**
 * Sign out via Cognito. If that fails (e.g. offline), drop the locally stored
 * tokens ourselves, so reloading the landing page doesn't sign the user back in.
 */
export async function signOutSafely(): Promise<void> {
  try {
    await signOut();
  } catch {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && AMPLIFY_KEY_PREFIXES.some((p) => key.startsWith(p))) keys.push(key);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    location.assign("/");
  }
}

/**
 * The signed-in user's email, from the ID token. Deliberately not
 * fetchUserAttributes(): that calls Cognito GetUser, which needs the
 * aws.cognito.signin.user.admin scope. The app client doesn't grant it, because
 * it would also let users change their own email attribute.
 */
export async function currentUser(): Promise<{ email: string; access: Access }> {
  const session = await fetchAuthSession();
  const payload = session.tokens?.idToken?.payload;
  return { email: emailFromIdTokenPayload(payload), access: accessFromIdTokenPayload(payload) };
}

export function emailFromIdTokenPayload(payload: Record<string, unknown> | undefined): string {
  const email = payload?.email;
  return typeof email === "string" ? email : "";
}
