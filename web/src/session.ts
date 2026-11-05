import { fetchAuthSession, signOut } from "aws-amplify/auth";

/** Sign out via Cognito; if that fails, at least drop back to the landing page. */
export async function signOutSafely(): Promise<void> {
  try {
    await signOut();
  } catch {
    location.assign("/");
  }
}

/**
 * The signed-in user's email, from the ID token. Deliberately not
 * fetchUserAttributes(): that calls Cognito GetUser, which needs the
 * aws.cognito.signin.user.admin scope. The app client doesn't grant it, because
 * it would also let users change their own email attribute.
 */
export async function currentUserEmail(): Promise<string> {
  const session = await fetchAuthSession();
  return emailFromIdTokenPayload(session.tokens?.idToken?.payload);
}

export function emailFromIdTokenPayload(payload: Record<string, unknown> | undefined): string {
  const email = payload?.email;
  return typeof email === "string" ? email : "";
}
