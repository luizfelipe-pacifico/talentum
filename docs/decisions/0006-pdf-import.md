# ADR 0006 — Local PDF import with layout readers and per-field confidence

- Status: accepted
- Date: 2026-11-20

## Context

Stage 7 of [ROADMAP.md](../ROADMAP.md) asks for PDF statement import: local readers per institution or layout, defensive extraction, per-field confidence, tests with hostile synthetic files and versioned reader maintenance. Many Brazilian banks and card issuers offer the monthly statement only as PDF, so without it the person types the card bill by hand.

A PDF is not a text file. It is a layout program that can declare thousands of pages, carry compressed streams that inflate when read, embed JavaScript, attachments, XFA forms and automatic actions, and reference external fonts. [SECURITY.md](../SECURITY.md) treats every uploaded file as hostile and forbids sending statements to any external service, including AI. The same two-step contract as CSV and OFX applies: inspect without writing, then write the whole batch in one transaction.

`pdfjs-dist` (Mozilla PDF.js) was already a dependency (version 6), unused.

## Options

### A. External OCR or AI extraction

Accurate on varied layouts, but it sends the statement off the device. Rejected by the local-first rule and by [SECURITY.md](../SECURITY.md), "Files, AI and hostile content".

### B. Command-line tools (`pdftotext`, Poppler)

Mature, but a native binary per platform to package with Electron, another supply-chain surface and a child process to sandbox. Text extraction quality is similar to PDF.js for text PDFs.

### C. PDF.js in the backend process, text only, with a reader registry

PDF.js is pure JavaScript, already installed, maintained by Mozilla and hardened for hostile input in a browser. Used only for `getTextContent`, it never renders, never runs scripts and can be told not to fetch anything. Layout knowledge lives in small pure readers that can be tested with synthetic PDFs built in the test.

## Decision

Option C.

1. **Detection by content.** A file whose first kilobyte contains `%PDF-` goes to the PDF path; the extension and declared type decide nothing.
2. **Extraction without execution or fetching** (`src/server/import/pdf/read-pdf.ts`, run inside the isolated thread of the amendment below): PDF.js's local worker module is imported in that thread, so PDF.js never creates a worker from a URL; `enableXfa: false`; no scripting API is called; `disableFontFace`, `useSystemFonts: false`, no standard-font or CMap URL; `useWorkerFetch: false`, `disableAutoFetch`, `disableStream`. PDF.js 6 contains no `eval` or `new Function` path (a test checks the installed bundles); `isEvalSupported: false` is still passed so a downgrade cannot reopen it. `serverExternalPackages` keeps PDF.js out of the Next.js bundler.
3. **Hard limits:** the 8 MiB upload ceiling, 40 pages, 400,000 extracted characters and 8 seconds. Exceeding any of them refuses the whole file; truncating would omit entries silently. An encrypted PDF is refused with a message that tells the person to export a copy without a password.
4. **Reader registry** (`src/server/import/pdf/layouts.ts`): each reader has a stable `id`, a `version`, a `kind` (`bank` or `card`), `detect` and `parse`. The highest score wins; the generic tabular reader is the last resort. The batch records `id@version` in `ImportBatch.parser`. The first two readers are generic (card statement and tabular bank statement): no reader is named after an institution until a synthetic fixture reproduces that institution's layout.
5. **Per-field confidence.** Every entry carries the confidence of date, amount and description, and the lowest is the entry's. Entries below 0.7 are not written: they become `LOW_CONFIDENCE` import issues that name the field to check and the page, never the line content. The preview shows, per row, whether it was read with certainty or which field to check.
6. **Fingerprint over the extracted text**, so a statement downloaded again with different PDF metadata is recognized as the same file.

## Consequences

- PDF import works offline, inside the existing limits, contracts and tests; the inspect route and the batch route accept PDF without a new endpoint, and card statements can import items from PDF too.
- Scanned PDFs (images without a text layer) produce no lines and are refused with `NO_ROWS`. OCR is out of scope.
- Generic readers cover tabular layouts with Brazilian number format. Statements with columns in another order, with dates split across lines, or with values in another format need a dedicated reader, added as described in [ARCHITECTURE.md](../ARCHITECTURE.md), §2.5.
- **Current (amendment below):** extraction runs in an isolated worker thread with memory limits and a hard deadline that preempts even a synchronous PDF.js step. The CSV and OFX parsers are still in the request process ([SECURITY.md](../SECURITY.md), Open item 16).
- **Open:** the active-content warning scans raw bytes and misses markers inside compressed object streams. It is informational; the protection is that nothing is ever executed.

## Amendment (2026-11-20): parsing in an isolated worker thread

### Context

The first version ran PDF.js in the local server process, the same process that holds the unlocked vault's database key, the session store and the environment (including the packaged app's per-run bootstrap secret). A malicious or malformed PDF could block the event loop with one long synchronous step that the cooperative timeout cannot interrupt, exhaust the heap and take the server down, or exploit a parser defect with the server's memory in reach.

### Options

- **`node:worker_threads` (chosen).** Same binary, no new dependency, works under the test runner, `next dev`, `next build` and the standalone server that Electron starts with `ELECTRON_RUN_AS_NODE`. `resourceLimits` caps the thread's heap and stack, `terminate()` stops it even mid-step, `env: {}` gives it an empty `process.env`, and the file bytes are transferred instead of shared. Limit: a thread shares the process address space, so a memory-corruption bug in V8 or in a native module would not be contained. PDF.js itself is JavaScript, but it loads the optional native `@napi-rs/canvas` package (a `pdfjs-dist` optional dependency, used for `DOMMatrix` and `Path2D` polyfills) when it can resolve it: development installs have it, the standalone output traced by `next build` (and so the Electron package) does not.
- **`child_process.fork`.** A separate address space, but it needs a standalone script outside the webpack bundle, its own copy and path resolution in the Electron package, a Node binary that Electron only provides through `runAsNode` (a fuse that [SECURITY.md](../SECURITY.md) item 20 wants to turn off) and a slower start per file. Kept as the next step if a native parser is ever added.
- **Electron `utilityProcess`.** Sandboxable, but only exists inside Electron; the browser development server and Docker would need a second path.

### Decision

`src/server/import/pdf/extract.ts` starts one thread per PDF (`extract-worker.ts`, which runs `read-pdf.ts`) and supervises it:

- input: a copy of the bytes, transferred, and the numeric limits in `workerData`; `env: {}`, no `argv`, no stdin, only the `--experimental-strip-types` flag family in `execArgv`; never the vault key, a database handle, the session or any environment variable;
- limits: `resourceLimits` of 256 MiB old generation, 32 MiB young generation and 4 MiB stack (`PDF_TOO_COMPLEX` when reached), a 12-second hard deadline that calls `terminate()` (`PDF_TIMEOUT`), the existing 8-second cooperative deadline inside the thread, and at most two threads at once;
- output: one message, validated as untrusted input with a strict schema and coherence checks; anything else, a crash or an exit without a reply is `PDF_READER_FAILED`; stdout and stderr are discarded so document content never reaches the logs;
- bundling: the `new Worker(new URL(...))` call stays literal so webpack emits the thread as its own server chunk, and `next.config.ts` sets `output.workerPublicPath: './'` so the chunk URL resolves on disk in the server and standalone builds.

### Consequences

- A hostile PDF can cost at most one thread's memory and 12 seconds; the server thread keeps answering and the vault key is never in the thread's reach through its inputs.
- Each PDF pays a thread start; a one-page synthetic PDF takes about 110 ms end to end in the tests. Two concurrent imports run in parallel; a third waits.
- **Open:** a separate process (the `child_process` option) would also contain native-code defects, including `@napi-rs/canvas` where it is installed.
- The person sees a specific message for each new outcome (`PDF_TOO_COMPLEX`, `PDF_READER_FAILED`) and is told that nothing was imported.
- Coverage: `tests/import-pdf-worker.test.mjs`.
