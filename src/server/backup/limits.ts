/* Teto do arquivo de backup cifrado aceito na restauração. Um banco pessoal
   fica muito abaixo. Módulo sem dependências: o middleware da API o importa
   (src/server/body-limits.ts). */
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
