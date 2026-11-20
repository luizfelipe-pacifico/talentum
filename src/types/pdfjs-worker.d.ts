/* O módulo do worker do pdf.js não publica tipos. Ele é importado só pelo
   efeito de registrar `globalThis.pdfjsWorker` (src/server/import/pdf/extract.ts). */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs';
