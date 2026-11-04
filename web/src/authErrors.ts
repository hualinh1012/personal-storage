/** True when Cognito redirected back with an allowlist denial from our trigger Lambdas. */
export function isAccessDeniedRedirect(search: string): boolean {
  const description = new URLSearchParams(search).get("error_description") ?? "";
  return description.includes("ACCESS_DENIED");
}
