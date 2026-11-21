-- Ligação opcional entre um compromisso e o cartão cuja fatura ele representa.
--
-- Com a ligação, o painel deixa de descontar o compromisso quando o mesmo
-- cartão tem fatura não cancelada com vencimento no mesmo mês: a mesma conta
-- não é subtraída duas vezes (docs/PRODUCT.md, V). Apagar o cartão desfaz a
-- ligação e o compromisso volta a pesar sozinho.
--
-- Migration aditiva: SQLite aceita ADD COLUMN com REFERENCES quando o padrão é
-- NULL, então nenhuma tabela é reconstruída nem apagada.

-- AlterTable
ALTER TABLE "ScheduledObligation" ADD COLUMN "creditCardId" TEXT REFERENCES "CreditCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ScheduledObligation_creditCardId_idx" ON "ScheduledObligation"("creditCardId");
