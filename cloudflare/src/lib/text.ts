import { deny } from './http.ts';

/* Texto puro vindo de pessoas ou de fontes externas.

   Normaliza para NFC, remove caracteres de controle e de inversão de direção
   (Trojan Source, falsificação visual), apara espaços e colapsa linhas em
   branco. Nada aqui interpreta HTML: o texto é guardado como texto e escapado
   na saída (o React da LP escapa por padrão). */

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

export function normalizeText(value: unknown, { multiline = true } = {}): string {
  if (typeof value !== 'string') return '';
  let text = value.normalize('NFC').replace(/\r\n?/g, '\n').replace(CONTROL, '');
  if (!multiline) text = text.replace(/\s+/g, ' ');
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Texto normalizado dentro dos limites, ou 400 com o código indicado. */
export function boundedText(value: unknown, min: number, max: number, code: string, multiline = true): string {
  const text = normalizeText(value, { multiline });
  if ([...text].length < min || [...text].length > max) deny(code, 400);
  return text;
}

/** Corta em `max` caracteres sem partir palavra, com reticências. */
export function excerpt(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max - 1).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** ID opaco aceito em caminhos: impede travessia e entradas gigantes. */
export const OPAQUE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function opaqueId(value: unknown, code = 'NOT_FOUND', status = 404): string {
  return typeof value === 'string' && OPAQUE_ID.test(value) ? value : deny(code, status);
}
