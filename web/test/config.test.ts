import { afterEach, describe, expect, it, vi } from "vitest";
import { googleImportConfig, loadConfig, toAmplifyOutputs, type AppConfig } from "../src/config";

const c: AppConfig = {
  region: "ap-southeast-1",
  userPoolId: "ap-southeast-1_abc123",
  userPoolClientId: "client123",
  cognitoDomain: "family-drive.auth.ap-southeast-1.amazoncognito.com",
  identityPoolId: "ap-southeast-1:00000000-0000-0000-0000-000000000000",
  filesBucket: "family-drive-files",
  appUrl: "https://d111111abcdef8.cloudfront.net",
};

describe("toAmplifyOutputs", () => {
  const o = toAmplifyOutputs(c, "http://localhost:5173");

  it("maps auth", () => {
    expect(o.version).toBe("1.4");
    expect(o.auth.aws_region).toBe(c.region);
    expect(o.auth.user_pool_id).toBe(c.userPoolId);
    expect(o.auth.user_pool_client_id).toBe(c.userPoolClientId);
    expect(o.auth.identity_pool_id).toBe(c.identityPoolId);
    expect(o.auth.oauth.domain).toBe(c.cognitoDomain);
    expect(o.auth.oauth.identity_providers).toEqual(["GOOGLE"]);
    expect(o.auth.oauth.response_type).toBe("code");
    expect(o.auth.oauth.scopes).toEqual(["openid", "email", "profile"]);
    expect(o.auth.oauth.redirect_sign_in_uri).toEqual(["http://localhost:5173/"]);
    expect(o.auth.oauth.redirect_sign_out_uri).toEqual(["http://localhost:5173/"]);
  });

  it("maps storage", () => {
    expect(o.storage.aws_region).toBe(c.region);
    expect(o.storage.bucket_name).toBe(c.filesBucket);
    expect(o.storage.buckets[0].name).toBe("drive");
    expect(o.storage.buckets[0].bucket_name).toBe(c.filesBucket);
    expect(o.storage.buckets[0].aws_region).toBe(c.region);
    expect(o.storage.buckets[0].paths).toEqual({
      "Global/*": { authenticated: ["get", "list", "write", "delete"] },
    });
  });
});

describe("loadConfig", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches /config.json", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => c });
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadConfig()).resolves.toEqual(c);
    expect(fetchMock).toHaveBeenCalledWith("/config.json", { cache: "no-store" });
  });

  it("throws when the file is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(loadConfig()).rejects.toThrow(/config\.json/);
  });

  it("explains a non-JSON body (e.g. the SPA fallback page served instead)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => JSON.parse("<!doctype html>") }),
    );
    await expect(loadConfig()).rejects.toThrow(/config\.json is not valid JSON/);
  });

  it("names a missing or empty key", async () => {
    const { userPoolId: _omit, ...missing } = c;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => missing }));
    await expect(loadConfig()).rejects.toThrow("config.json is missing userPoolId");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...c, filesBucket: "" }) }));
    await expect(loadConfig()).rejects.toThrow("config.json is missing filesBucket");
  });
});

describe("googleImportConfig", () => {
  const google = {
    googleClientId: "123-abc.apps.googleusercontent.com",
    googleApiKey: "AIzaTestKey",
    googleProjectNumber: "123",
  };

  it("returns the Google values when all are set", () => {
    expect(googleImportConfig({ ...c, ...google })).toEqual({
      clientId: google.googleClientId,
      apiKey: google.googleApiKey,
      projectNumber: google.googleProjectNumber,
    });
  });

  it("is null when any value is the CHANGE_ME placeholder", () => {
    for (const key of Object.keys(google) as (keyof typeof google)[]) {
      expect(googleImportConfig({ ...c, ...google, [key]: "CHANGE_ME" })).toBeNull();
    }
  });

  it("is null when any value is missing or empty (e.g. a config.json from before the import)", () => {
    expect(googleImportConfig(c)).toBeNull();
    expect(googleImportConfig({ ...c, ...google, googleApiKey: "" })).toBeNull();
    expect(googleImportConfig({ ...c, ...google, googleProjectNumber: "  " })).toBeNull();
  });
});

describe("loadConfig with Google values", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("doesn't require them, so a missing Google setup never stops the drive", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => c }));
    await expect(loadConfig()).resolves.toEqual(c);
  });

  it("passes them through when present", async () => {
    const withGoogle = { ...c, googleClientId: "id", googleApiKey: "CHANGE_ME", googleProjectNumber: "1" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => withGoogle }));
    await expect(loadConfig()).resolves.toEqual(withGoogle);
  });
});
