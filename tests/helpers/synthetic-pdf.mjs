/* Gerador de PDF sintético para os testes do importador.

   Monta o arquivo à mão, objeto por objeto, com a tabela xref calculada. Nenhum
   extrato real é usado (docs/SECURITY.md): todo texto vem do próprio teste.
   Só ASCII: a fonte padrão Helvetica usa WinAnsi, e acento não acrescenta nada
   ao que estes testes verificam. */

/**
 * @param {Array<Array<[number, number, string]>>} pages linhas por página: [x, y, texto]
 * @param {{ catalogExtra?: string, extraObjects?: string[], declaredPages?: number }} [options]
 * @returns {Uint8Array}
 */
export function buildPdf(pages, options = {}) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalog = add(null);
  const pagesId = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const escapeText = (text) => text.replace(/[\\()]/g, (char) => `\\${char}`);

  const kids = [];
  for (const lines of pages) {
    const content = lines.map(([x, y, text]) => `BT /F1 9 Tf ${x} ${y} Td (${escapeText(text)}) Tj ET`).join('\n');
    const stream = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`,
      ),
    );
  }
  for (const extra of options.extraObjects ?? []) add(extra);

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R ${options.catalogExtra ?? ''} >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${options.declaredPages ?? kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

/** Linhas de uma tabela: cada linha é [data, descrição, valor, saldo?], de cima para baixo. */
export function tableLines(rows, top = 700) {
  const lines = [];
  rows.forEach((row, index) => {
    const y = top - index * 16;
    lines.push([40, y, row[0]]);
    lines.push([110, y, row[1]]);
    lines.push([400, y, row[2]]);
    if (row[3] !== undefined) lines.push([490, y, row[3]]);
  });
  return lines;
}
