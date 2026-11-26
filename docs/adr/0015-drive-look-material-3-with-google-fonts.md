# Drive-style look in Material Design 3, fonts from Google Fonts

The family already knows Google Drive, so Family Drive copies its layout and interaction patterns ([#13](https://github.com/hualinh1012/personal-storage/issues/13)): a top bar with a large rounded search, a left sidebar with "+ New" and the drive's locations, a white rounded main area, file-type icons, menus and states drawn in **Material Design 3** (light only).

- **Look and patterns only, not Google's brand.** The app keeps its own name and icon. No Google logos, product names, the Drive icon, or Google Sans; text is **Roboto** and icons are **Material Symbols** (both Apache 2.0).
- **Both fonts come from Google Fonts** (`fonts.googleapis.com` for the CSS, `fonts.gstatic.com` for the files), linked from `web/index.html` (owner's choice over bundling them). The CSP (`infra/web.tf`) allows those two hosts in `style-src` and `font-src`.
- **Storage Browser stays** ([0002](0002-storage-browser-without-amplify-backend.md)). The look comes from CSS (our `--md-*` tokens, and Amplify UI's `--amplify-*` tokens pointed at the same values) and from its `components` slots (the search box is its `SearchField` slot, portalled into the top bar). Patterns it can't support are noted on #13 instead of replacing it.

## Consequences

- Every page load asks Google for the font CSS and files, so Google sees the visitor's IP address and the app's origin (as a referrer). The family already signs in with Google, so this tells Google little new; bundling the fonts (npm `@fontsource/roboto`, `material-symbols`) would remove the requests and the two CSP hosts if that changes.
- Material Symbols is loaded with `display=block`: until the font arrives, icons are blank rather than showing their ligature names ("search", "folder"). If Google Fonts is unreachable the names show as text; every icon is decorative (`aria-hidden`) next to a labelled control, so the app still works.
- Upgrading `@aws-amplify/ui-react-storage` needs the playground re-checked (`?view=drive`), since the restyle targets its classes and tokens.
