# ADR 0002 — Own OFX reader instead of `ofx-data-extractor`

- Status: accepted
- Date: 2026-09-12

## Context

The development guide (then `docs/DEVELOPMENT.md`, now [BEST_PRACTICES.md](../BEST_PRACTICES.md)) recorded that the generic "Node-OFX" named in the source document had been made concrete as the `ofx-data-extractor` dependency, "with types, normalization and validation". The dependency was declared in `package.json`, but no code used it: statement import (Feature 4 in [PRODUCT.md](../PRODUCT.md)) did not exist yet.

While implementing Feature 4, the library was exercised for the first time with representative OFX files. Two limitations appeared.

### 1. Failure on OFX 1.x/SGML

The OFX standard has two serializations. Version 1.x is SGML and allows leaf tags to stay **unclosed**: `<TRNAMT>-100.50` ends at the next `<`. This is the serialization Brazilian banks export.

Given such a file, `ofx-data-extractor` builds JSON by string concatenation, nests `STMTRS` inside `STATUS` and produces an invalid document. `toNormalized()` throws `SyntaxError: Expected ',' or '}' after property value in JSON` while parsing. An OFX 2.x file, in XML with every tag closed, is read correctly, but that is not the format the MVP needs to read.

### 2. Money as floating point

The normalized output exposes the amount as a `number`:

```json
{ "amount": -100.5, "amountAbs": 100.5, "raw": { "TRNAMT": "-100.50" } }
```

[DATABASE.md](../DATABASE.md) requires that "monetary values use integer cents or `Decimal`, never `Float`", and the dashboard specification in [PRODUCT.md](../PRODUCT.md) (R-25) requires `BigInt` cents up to the presentation edge. Consuming the normalized field would violate both rules. The `raw.TRNAMT` field preserves the original text, but using only `raw` means not using the normalization, which was the reason to adopt the library.

## Options

### A. Keep the library and work around both limitations

Convert SGML to XML before handing the file over and read only `raw.TRNAMT`. This requires an SGML pre-processor, that is, writing exactly the hard part, and still keeps the dependency's surface.

### B. Switch to another OFX library

No alternative in the ecosystem combines SGML support, exact amounts and active maintenance. Switching dependencies only moves the risk.

### C. Read the needed subset in the project itself

The MVP needs four things from the file: the list of `STMTTRN`, the declared period, the closing balance and the account identification. The shape of those four has been stable since OFX 1.0.

## Decision

Adopt option **C**. `src/server/import/ofx.ts` reads the needed OFX subset, covering SGML (1.x) and XML (2.x) with the same extraction pattern, because in both the value of a leaf tag ends at the next `<`.

`ofx-data-extractor` is removed from `package.json`.

## Consequences

Positive:

- the files Brazilian banks actually export can be read;
- the amount stays text until `parseAmountCents`, which returns `BigInt` cents: there is no floating-point path for money;
- the parser is bounded and auditable, in line with the "isolated, bounded parser" requirement of [SECURITY.md](../SECURITY.md): it executes no embedded content, resolves no external entities (it decodes only the predefined XML entities, `&nbsp;` and numeric character references) and respects the ceilings in `src/server/import/limits.ts`;
- one fewer dependency in the supply chain.

Negative and known limits:

- the reader covers bank statements (`STMTTRN` inside `BANKMSGSRSV1`). Credit-card statements (`CREDITCARDMSGSRSV1`), investments and multiple statements in one file are **not** covered; cards are Stage 8 of [ROADMAP.md](../ROADMAP.md) and the reader must be extended there;
- maintaining the parser becomes the project's responsibility. The cost is contained by `tests/import-ofx.test.mjs`, which pins SGML, XML, entities, civil dates and unreadable entries.

## Verification

`tests/import-ofx.test.mjs` covers, with synthetic fixtures:

- OFX 1.x/SGML with unclosed leaf tags, the case that motivated this ADR;
- OFX 2.x/XML with entities;
- amounts always `BigInt`, never `number`;
- period, balance and account declared by the file;
- an unreadable entry recorded as an issue without failing the batch;
- refusal of a file that is not OFX.
