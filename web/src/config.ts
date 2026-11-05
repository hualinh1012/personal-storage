export interface AppConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  cognitoDomain: string;
  identityPoolId: string;
  filesBucket: string;
  appUrl: string;
}

/** Every family file lives under this prefix; the Identity Pool role only allows it. */
export const DRIVE_PREFIX = "drive/";

/** Storage Browser location for the shared drive, so it opens there instead of a location picker. */
export function driveLocation(bucket: string) {
  return {
    bucket,
    prefix: DRIVE_PREFIX,
    type: "PREFIX" as const,
    permissions: ["delete", "get", "list", "write"] as ("delete" | "get" | "list" | "write")[],
  };
}

const CONFIG_KEYS: (keyof AppConfig)[] = [
  "region",
  "userPoolId",
  "userPoolClientId",
  "cognitoDomain",
  "identityPoolId",
  "filesBucket",
  "appUrl",
];

export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch("/config.json");
  if (!res.ok) throw new Error(`Failed to load /config.json (HTTP ${res.status})`);

  let raw: Record<string, unknown>;
  try {
    raw = (await res.json()) as Record<string, unknown>;
  } catch {
    // CloudFront serves index.html for missing paths, so a missing file can arrive as HTML.
    throw new Error("config.json is not valid JSON (was it deployed? see scripts/write-config.sh)");
  }
  for (const key of CONFIG_KEYS) {
    if (typeof raw?.[key] !== "string" || raw[key] === "") {
      throw new Error(`config.json is missing ${key}`);
    }
  }
  return raw as unknown as AppConfig;
}

/** Gen 2-shaped outputs object, accepted by Amplify.configure (any version starting with "1"). */
export function toAmplifyOutputs(c: AppConfig, origin: string) {
  const redirect = [`${origin}/`];
  return {
    version: "1.4",
    auth: {
      aws_region: c.region,
      user_pool_id: c.userPoolId,
      user_pool_client_id: c.userPoolClientId,
      identity_pool_id: c.identityPoolId,
      oauth: {
        identity_providers: ["GOOGLE"],
        domain: c.cognitoDomain,
        scopes: ["openid", "email", "profile"],
        redirect_sign_in_uri: redirect,
        redirect_sign_out_uri: redirect,
        response_type: "code",
      },
    },
    storage: {
      aws_region: c.region,
      bucket_name: c.filesBucket,
      buckets: [
        {
          name: "drive",
          bucket_name: c.filesBucket,
          aws_region: c.region,
          paths: { [`${DRIVE_PREFIX}*`]: { authenticated: ["get", "list", "write", "delete"] } },
        },
      ],
    },
  };
}
