/* Decodificação e saneamento do texto do extrato.

   Módulo puro: recebe bytes, devolve texto. Sem Prisma, sem rede, sem disco.

   Três problemas reais aparecem em extrato bancário brasileiro e são tratados
   aqui, porque nenhum deles pode chegar ao parser de CSV:

   1. BOM UTF-8 no início do arquivo, que grudaria no primeiro cabeçalho;
   2. arquivos gravados em Windows-1252 em vez de UTF-8;
   3. mojibake parcial — campos que o banco gravou com UTF-8 lido como Latin-1,
      convivendo no mesmo arquivo com campos corretos. */

/** Sequências de controle que nunca pertencem a um extrato legítimo. */
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export type StatementTextErrorCode = 'BINARY_CONTENT' | 'UNREADABLE_ENCODING' | 'EMPTY_FILE';

/* Campo atribuído no corpo do construtor, e não por parameter property: o
   executor de testes do Node roda TypeScript em modo strip-only, que não
   suporta essa sintaxe. Manter o módulo importável por `node --test` é o que
   permite testar as fórmulas sem etapa de build (docs/DEVELOPMENT.md). */
export class StatementTextError extends Error {
  readonly code: StatementTextErrorCode;

  constructor(code: StatementTextErrorCode) {
    super(code);
    this.name = 'StatementTextError';
    this.code = code;
  }
}

/**
 * Runs que caracterizam UTF-8 lido como Latin-1.
 *
 * `Ã£` (0xC3 0xA3) é o `ã` visto byte a byte; `â€` abre as aspas tipográficas.
 * Casar apenas o run, e não o texto inteiro, é o que permite consertar um campo
 * corrompido sem estragar o campo vizinho que já está correto.
 */
const MOJIBAKE_RUN = /(?:[Â-ß][-¿]|â[-¿]|â[-¿])+/g;

const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const utf8Lenient = new TextDecoder('utf-8');

/**
 * Reconverte um trecho que foi decodificado com a tabela errada.
 *
 * Devolve `null` quando a reconversão não produz UTF-8 válido: nesse caso o
 * texto original provavelmente estava certo e não deve ser tocado.
 */
function redecodeRun(run: string): string | null {
  const bytes = new Uint8Array(run.length);
  for (let index = 0; index < run.length; index += 1) {
    const code = run.charCodeAt(index);
    if (code > 0xff) return null;
    bytes[index] = code;
  }
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Conserta mojibake ocorrência por ocorrência.
 *
 * Extratos reais chegam com corrupção parcial: o mesmo arquivo traz um campo
 * correto e outro duplamente codificado. Reconverter o arquivo inteiro
 * quebraria o campo que já estava certo, então o conserto é por run.
 */
export function repairMojibake(text: string): string {
  return text.replace(MOJIBAKE_RUN, (run) => redecodeRun(run) ?? run);
}

/** Remove o BOM UTF-8, que de outro modo gruda no primeiro nome de coluna. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export type DecodedStatement = {
  text: string;
  /** Tabela efetivamente usada. Vai para a prévia, para a pessoa conferir. */
  encoding: 'utf-8' | 'windows-1252';
  /** `true` quando ao menos um campo precisou de conserto de mojibake. */
  repaired: boolean;
};

/**
 * Decodifica os bytes do extrato.
 *
 * Tenta UTF-8 estrito primeiro. Só cai para Windows-1252 quando o arquivo não é
 * UTF-8 válido — a ordem importa, porque Windows-1252 aceita qualquer byte e
 * decodificaria um arquivo UTF-8 silenciosamente errado.
 *
 * Bytes de controle reprovam o arquivo: um extrato é texto, e conteúdo binário
 * disfarçado de CSV é justamente o vetor que `docs/SECURITY.md` manda barrar.
 */
export function decodeStatement(bytes: Uint8Array): DecodedStatement {
  if (bytes.byteLength === 0) throw new StatementTextError('EMPTY_FILE');

  let text: string;
  let encoding: DecodedStatement['encoding'];

  try {
    text = utf8Strict.decode(bytes);
    encoding = 'utf-8';
  } catch {
    // Windows-1252 é a tabela usada pelos exportadores legados dos bancos.
    const decoder = new TextDecoder('windows-1252');
    text = decoder.decode(bytes);
    encoding = 'windows-1252';
    if (text.includes('�')) throw new StatementTextError('UNREADABLE_ENCODING');
  }

  text = stripBom(text);
  if (FORBIDDEN_CONTROL.test(text)) throw new StatementTextError('BINARY_CONTENT');

  const repairedText = repairMojibake(text);
  return { text: repairedText, encoding, repaired: repairedText !== text };
}

/**
 * Quebra o texto em linhas não vazias, aceitando CRLF, CR e LF.
 *
 * A numeração devolvida é a do arquivo, contando a partir de 1, para que um
 * `ImportIssue` aponte a linha que a pessoa vê ao abrir o extrato.
 */
export function splitLines(text: string): { lineNumber: number; content: string }[] {
  const lines: { lineNumber: number; content: string }[] = [];
  const raw = text.split(/\r\n|\r|\n/);
  for (let index = 0; index < raw.length; index += 1) {
    const content = raw[index];
    if (content.trim().length > 0) lines.push({ lineNumber: index + 1, content });
  }
  return lines;
}

/** Normaliza rótulo de coluna para comparação: sem acento, sem caixa, sem ruído. */
export function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Colapsa espaços e corta no teto de caracteres persistido. */
export function collapseWhitespace(value: string, maxChars: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars - 1)}…` : collapsed;
}
