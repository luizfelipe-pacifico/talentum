import { excerpt, normalizeText } from '../lib/text.ts';

/* Leitura defensiva de RSS 2.0.

   Não há parser XML genérico: um feed com DOCTYPE ou ENTITY é recusado inteiro
   (sem expansão de entidades, sem XXE, sem "billion laughs"); só as cinco
   entidades predefinidas e referências numéricas válidas são decodificadas; o
   número de itens e o tamanho de cada campo são limitados. HTML da descrição
   vira texto puro. */

export type FeedItem = { guid: string; title: string; url: string; excerpt: string; publishedAt: string };

const MAX_ITEMS = 50;
const MAX_FIELD = 200_000;

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos|nbsp);/g, (_, entity: string) => {
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'amp') return '&';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    if (entity === 'nbsp') return ' ';
    const code = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
  });
}

function unwrap(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decodeEntities(raw);
}

/** HTML em texto puro: remove script, style e marcas; decodifica entidades. */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .slice(0, MAX_FIELD)
    .replace(/<(script|style|noscript|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|blockquote|tr)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]{0,2000}>/g, ' ');
  return normalizeText(decodeEntities(withoutBlocks).replace(/[ \t]+/g, ' '));
}

function field(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]{0,500})?>([\\s\\S]{0,${MAX_FIELD}}?)</${name}>`, 'i'));
  return match ? unwrap(match[1]).trim() : null;
}

export function isAllowedLink(value: string, hosts: readonly string[]): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && hosts.includes(url.hostname) && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/** Itens válidos do feed; lança quando o documento declara DTD ou entidades. */
export function parseFeed(xml: string, hosts: readonly string[], nowMs = Date.now()): FeedItem[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('FEED_DTD_REFUSED');
  const items: FeedItem[] = [];
  const pattern = /<item\b[^>]{0,500}>([\s\S]*?)<\/item>/gi;
  for (let match = pattern.exec(xml); match && items.length < MAX_ITEMS; match = pattern.exec(xml)) {
    const block = match[1];
    const title = normalizeText(htmlToText(field(block, 'title') ?? ''), { multiline: false });
    const url = (field(block, 'link') ?? '').trim();
    const published = Date.parse(field(block, 'pubDate') ?? '');
    if (!title || [...title].length > 300 || !isAllowedLink(url, hosts) || Number.isNaN(published)) continue;
    const description = htmlToText(field(block, 'description') ?? '');
    items.push({
      guid: (field(block, 'guid') ?? url).slice(0, 500),
      title,
      url,
      excerpt: excerpt(description.replace(/\s+/g, ' '), 300),
      publishedAt: new Date(Math.min(published, nowMs)).toISOString(),
    });
  }
  return items;
}

/** Corpo de resposta limitado em bytes; passa do limite, aborta. */
export async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) throw new Error('TOO_LARGE');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('TOO_LARGE');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(all);
}
