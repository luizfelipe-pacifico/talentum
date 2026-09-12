-- Origem do saldo informado.
--
-- Sem esta coluna, desfazer uma importação só conseguia identificar o saldo que
-- ela gravou por aproximação — pelo instante de criação — e apagaria junto um
-- saldo que a pessoa tivesse informado à mão depois da importação.
--
-- Migration aditiva: nenhuma tabela já aplicada é reconstruída.

-- AlterTable
ALTER TABLE "BalanceSnapshot" ADD COLUMN "importBatchId" TEXT REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "BalanceSnapshot_importBatchId_idx" ON "BalanceSnapshot"("importBatchId");
