-- Envio idempotente de compromissos e fontes de renda.
--
-- Um duplo clique em "Salvar compromisso" criava dois registros iguais e o
-- painel descontava a conta duas vezes. O formulário passa a mandar uma chave
-- UUID por envio; com a restrição única por perfil, o reenvio devolve o
-- registro já criado. Registros antigos ficam com a chave nula, e o SQLite
-- não considera nulos repetidos como conflito.
--
-- Migration aditiva: só colunas anuláveis e índices únicos.

-- AlterTable
ALTER TABLE "ScheduledObligation" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "IncomeSource" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledObligation_profileId_idempotencyKey_key" ON "ScheduledObligation"("profileId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeSource_profileId_idempotencyKey_key" ON "IncomeSource"("profileId", "idempotencyKey");
