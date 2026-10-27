/* O Prisma Client gerado corresponde ao schema atual?

   O gerador guarda uma cópia do schema junto do cliente. Comparar as duas evita
   regenerar à toa: no Windows o servidor de desenvolvimento trava a DLL do
   Prisma, e regenerar com ele aberto falha com EPERM. */

/* O gerador reformata a cópia (alinhamento de colunas): espaço não é mudança de schema. */
const normalize = (text) => text.replace(/\s+/g, ' ').trim();

export function clientIsCurrent(schema, generatedSchema) {
  return generatedSchema !== null && normalize(schema) === normalize(generatedSchema);
}
