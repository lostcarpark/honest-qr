# Honest QR

A QR code generator that puts an image in the middle of the code, sized so the code still scans reliably.

## How the image is sized

Codes are always generated at error-correction level **H**. Instead of using the usual "about 30% of the area" rule of thumb, the app works out exactly what the image covers:

1. Each data module is mapped to the codeword it belongs to, and each codeword to its Reed-Solomon block (`src/qr/codewords.ts`). This follows the same zig-zag placement and block interleaving the encoder uses.
2. The image square grows two modules at a time from the centre. It stops at the last size where every block keeps at least **half** of its correction capacity in reserve (`DEFAULT_SAFETY` in `src/qr/logo.ts`), and where the square doesn't touch a finder pattern, separator, timing pattern, or format or version information.

The tests decode the result with an independent decoder (jsQR). They do this with the image area blanked, and with every covered module deliberately flipped to the wrong colour.

A short URL makes a small code with little room for an image. Choosing a larger **minimum version** in the UI leaves room for a bigger one.

## Development

Inside the DDEV web container (or prefix the commands with `ddev`):

```sh
npm install
npm run dev        # https://honest-qr.ddev.site:5173
npm test           # unit and component tests
npm run coverage   # tests with coverage report in reports/coverage
npm run lint       # oxlint, warnings fail
npm run typecheck  # tsc
npm run build      # production build in dist/
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, tests with coverage, and build on every push and pull request.
