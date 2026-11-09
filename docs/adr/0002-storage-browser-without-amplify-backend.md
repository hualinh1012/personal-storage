# Storage Browser on Terraform-made Cognito, without Amplify's backend tooling

The file UI is AWS's ready-made Storage Browser for S3 (`@aws-amplify/ui-react-storage`), not a hand-built browser. The project uses Amplify JS only as a client library. The Cognito and Identity Pool resources come from Terraform, and `toAmplifyOutputs()` in `web/src/config.ts` hand-builds the Amplify Gen 2 outputs shape from `config.json`. This keeps all infrastructure in one Terraform codebase instead of splitting it with Amplify Gen 2.

## Consequences

Features Storage Browser doesn't offer are added as custom actions (Move in `web/src/move/`) or around it (the top-bar Upload button), and layout CSS targets its `amplify-storage-browser__*` classes. Upgrading the package means re-checking those.
