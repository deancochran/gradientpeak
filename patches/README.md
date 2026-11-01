# Security compatibility patches

These patches adapt narrow dependency interfaces; they do not suppress audits.

- `query-string@7.1.3`: Expo Router's legacy CommonJS parser needs the default
  export of the security-fixed ESM decoder. The mobile router-query security
  regression exercises the actual installed parser, including malformed input.
- `metro@0.83.3`: Expo 54 pins this Metro release. Its ordinary image asset path
  passes a filename to `image-size`, whereas fixed `image-size@2` accepts bytes.
  Read image bytes before calling the decoder, matching Metro's existing archived
  asset behavior; non-image assets still skip decoding. The mobile Metro asset
  regression exercises the real Expo dependency path and Router PNG. A local iOS
  export is required in addition to Node tests. Remove this patch when Expo's
  supported Metro release handles the fixed decoder without adaptation.

Better Auth packages are aligned at 1.7.14. Restart OAuth/Magic Link flows begun
before the security cutover; do not mix old/new auth servers for those flows.
Dependency upgrades do not authorize migrations of preserved databases.
