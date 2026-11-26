# web/CLAUDE.md

Rules for the SPA that are easy to break and expensive to find. The why and the full picture
are in the docs: the screen, drive host and drive storage in
[`docs/features/drive-ui.md`](../docs/features/drive-ui.md), each feature in its own doc under
`docs/features/`.

## Storage Browser

- **Keep `StorageBrowser` uncontrolled.** Use `defaultValue`, never `value`/`onValueChange` to
  drive it: a controlled browser never reports the Exit of a view opened from outside. To open a
  view or location from outside, remount it (`key`) with `defaultValue` `{ location, actionType }`.
- **A custom view over another view's selection** (Move over Copy's, Restore and Delete
  permanently over Delete's) passes `useStableItems(tasks)` (`src/driveHost/stableItems.ts`) to
  `useAction`, never `tasks.map(...)`, or it loops ("Maximum update depth exceeded").
- **`src/driveHost/storageBrowser.ts` is the only file that knows Storage Browser's internal
  shapes** and casts against its typings. Don't cast elsewhere.
- **Create the browser after `Amplify.configure`**, never at module level: the auth adapter reads
  the storage config when it's built.
- **Features plug in as one `DriveFeature`** in their own `feature.ts`, listed in
  `src/features.ts`. `DriveView` has no feature-specific code; keep it that way. Views get where
  the person is from `useDriveHost()` and their own dependencies from the feature factory's
  arguments, not React contexts.
- **After upgrading `@aws-amplify/ui-react-storage`**, re-check `storageBrowser.ts`,
  `src/pagination/rows.ts` (mirrors its `parseResult`) and `styles.css` (targets its
  `amplify-storage-browser__*` classes) in the playground at desktop and phone width.

## Access

- **`src/locationPolicy.ts` answers "who can do what where".** Home, the sidebar, **+ New**,
  every action's `hide` (`hideUnless(...)`) and Restore's `canWriteAt` read it. Never re-derive
  access from permission strings or flags elsewhere.
- The UI only hides what IAM refuses. Its table test (`test/locationPolicy.test.ts`) is checked by
  hand against `infra/identity.tf`: change both together.
- `personalPrefix()` lower-cases the email; IAM compares it with the raw claim.

## S3

- **Every S3 call our features make goes through `DriveStorage`** (`src/storage/`). No code of
  ours calls Amplify Storage. A new operation goes into the interface, `s3Storage.ts`,
  `memoryStorage.ts` and the contract (`test/driveStorageContract.ts`).
- **Delete never deletes outside `Deleted/`**: it copies into `Deleted/` and then removes the
  original ([ADR 0011](../docs/adr/0011-delete-moves-to-a-deleted-folder.md)).
- Moves, restores and imports never overwrite an existing file.

## Look

- Material Design 3 in Google Drive's layout, light only, **never Google's brand**: no logos,
  product names or Google Sans ([ADR 0015](../docs/adr/0015-drive-look-material-3-with-google-fonts.md)).
- Colours and sizes come from the `--md-*` tokens at the top of `src/styles.css`; icons are
  `<Icon name="…">` (Material Symbols).

## Safety

- **Markdown preview** (`src/preview/MarkdownPreview.tsx`) keeps `skipHtml`, the default URL
  sanitising and images shown as links: rendered files run in every family member's browser.
- **A new external host** the browser loads or calls (fetch, script, iframe, image, media, font)
  must be added to `local.csp` in `infra/web.tf`. The dev server and playground don't apply the
  CSP, so a missing host only shows up behind CloudFront.
- The Google token lives only in `src/googleImport/google.ts` memory and goes only to Google;
  `driveClient.ts` is the only code calling the Drive API.
- No app service worker or offline cache ([ADR 0007](../docs/adr/0007-pwa-without-offline-cache.md)).

## Checking a change

- `npm run lint`, `npm test`, then `npm run build` (type-checks). CI runs the same.
- Lint warnings (`react/refs`, `react/set-state-in-effect`, `react/exhaustive-deps`) mark code
  that does this on purpose today. Don't "fix" one without reading why (ADR 0016); don't add new ones.
- UI changes: the playground (`npm run dev`, `/playground.html?view=drive`), with `&access=read`
  for the read-only screen. Its options are listed in the root `CLAUDE.md`.
