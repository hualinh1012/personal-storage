import { describe, expect, it } from "vitest";
import { isAccessDeniedRedirect } from "../src/authErrors";

describe("isAccessDeniedRedirect", () => {
  it("detects PreSignUp denial", () => {
    expect(
      isAccessDeniedRedirect("?error_description=PreSignUp+failed+with+error+ACCESS_DENIED.&error=invalid_request"),
    ).toBe(true);
  });
  it("detects PreTokenGeneration denial", () => {
    expect(isAccessDeniedRedirect("?error_description=PreTokenGeneration%20failed%20with%20error%20ACCESS_DENIED.")).toBe(true);
  });
  it("ignores a normal code redirect", () => {
    expect(isAccessDeniedRedirect("?code=abc&state=xyz")).toBe(false);
  });
  it("ignores an empty query", () => {
    expect(isAccessDeniedRedirect("")).toBe(false);
  });
  it("ignores unrelated errors", () => {
    expect(isAccessDeniedRedirect("?error_description=Something+else+broke&error=server_error")).toBe(false);
  });
});
