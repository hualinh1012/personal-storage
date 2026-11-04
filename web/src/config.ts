export interface AppConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  cognitoDomain: string;
  identityPoolId: string;
  filesBucket: string;
  appUrl: string;
}

export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch("/config.json");
  if (!res.ok) throw new Error(`Failed to load /config.json (HTTP ${res.status})`);
  return (await res.json()) as AppConfig;
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
          paths: { "drive/*": { authenticated: ["get", "list", "write", "delete"] } },
        },
      ],
    },
  };
}
