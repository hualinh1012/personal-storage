# Google Drive import uses the `drive.readonly` scope

Import from Google Drive (issue #1) must copy whole folders recursively. We'd prefer `drive.file`, which only grants the items a person picks in Google Picker, but a spike (issue #2, 2026-11-09) showed it can't do that. With a `drive.file` token, picking a folder in Picker (`setSelectFolderEnabled(true)`) and then calling `files.list` with `'<folderId>' in parents and trashed = false` returned HTTP 200 with **no files**, even though the folder holds 32 files. Picking a folder grants the folder, not its contents.

Under `drive.readonly`, the same pick and the same call listed all 32 children. Each `files.get?alt=media` (`.xlsx` files up to 2.7 MB) and `files.export` (Google Sheets → `.xlsx`, up to 9.5 MB) returned HTTP 200. The test folder had no subfolder, so grandchildren weren't exercised; `drive.readonly` covers every file the person can read, so they're accessible the same way.

So the import requests `https://www.googleapis.com/auth/drive.readonly`, and still uses Google Picker to let people choose what to import. The token stays in memory and is sent only to Google's APIs.

Consequences:
- `drive.readonly` is a **restricted** scope. Publishing the app would need Google verification and a security assessment, so the OAuth consent screen stays in **Testing**, and every family member who imports must be added as a test user (limit 100).
- Testing mode applies to the whole OAuth client, so Google sign-in to Family Drive itself (through Cognito, same client) is also limited to test users. In practice the test-user list must contain everyone on the allowlist (`/family-drive/allowed_emails`); keep them in step when adding someone.
- On first import, family members see Google's "unverified app" warning and a consent line reading "See and download all your Google Drive files".
- If Google later lets `drive.file` grant a picked folder's contents, switching back is a one-line scope change plus a re-check.
