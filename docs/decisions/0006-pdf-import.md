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
2. **Extraction without execution or fetching** (`src/server/import/pdf/extract.ts`): the local worker module is imported in the same process, so PDF.js never creates a worker from a URL; `enableXfa: false`; no scripting API is called; `disableFontFace`, `useSystemFonts: false`, no standard-font or CMap URL; `useWorkerFetch: false`, `disableAutoFetch`, `disableStream`. PDF.js 6 contains no `eval` or `new Function` path (a test checks the installed bundles); `isEvalSupported: false` is still passed so a downgrade cannot reopen it. `serverExternalPackages` keeps PDF.js out of the Next.js bundler.
3. **Hard limits:** the 8 MiB upload ceiling, 40 pages, 400,000 extracted characters and 8 seconds. Exceeding any of them refuses the whole file; truncating would omit entries silently. An encrypted PDF is refused with a message that tells the person to export a copy without a password.
4. **Reader registry** (`src/server/import/pdf/layouts.ts`): each reader has a stable `id`, a `version`, a `kind` (`bank` or `card`), `detect` and `parse`. The highest score wins; the generic tabular reader is the last resort. The batch records `id@version` in `ImportBatch.parser`. The first two readers are generic (card statement and tabular bank statement): no reader is named after an institution until a synthetic fixture reproduces that institution's layout.
5. **Per-field confidence.** Every entry carries the confidence of date, amount and description, and the lowest is the entry's. Entries below 0.7 are not written: they become `LOW_CONFIDENCE` import issues that name the field to check and the page, never the line content. The preview shows, per row, whether it was read with certainty or which field to check.
6. **Fingerprint over the extracted text**, so a statement downloaded again with different PDF metadata is recognized as the same file.

## Consequences

- PDF import works offline, inside the existing limits, contracts and tests; the inspect route and the batch route accept PDF without a new endpoint, and card statements can import items from PDF too.
- Scanned PDFs (images without a text layer) produce no lines and are refused with `NO_ROWS`. OCR is out of scope.
- Generic readers cover tabular layouts with Brazilian number format. Statements with columns in another order, with dates split across lines, or with values in another format need a dedicated reader, added as described in [ARCHITECTURE.md](../ARCHITECTURE.md), §2.5.
- **Open:** extraction runs in the request process. The timeout is checked between asynchronous steps and raced with a timer, but one long synchronous PDF.js step cannot be preempted; isolating parsing in a worker thread with `terminate()` remains the Open item already listed for CSV and OFX in [SECURITY.md](../SECURITY.md).
- **Open:** the active-content warning scans raw bytes and misses markers inside compressed object streams. It is informational; the protection is that nothing is ever executed.
