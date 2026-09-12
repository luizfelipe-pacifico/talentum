'use client';

import { useCallback, useState } from 'react';
import { ApiError, postForm, postJson } from '@/lib/api-client';

/* Estado do assistente de importação.

   O arquivo escolhido fica em memória no cliente entre a inspeção e a
   confirmação, e é reenviado na gravação. Isso evita uma área de arquivos
   temporários no servidor: o extrato só existe no dispositivo e durante o
   processamento da requisição (docs/HOW-IT-WORKS.md). */

export type ColumnRole =
  | 'date'
  | 'description'
  | 'amount'
  | 'debitAmount'
  | 'creditAmount'
  | 'direction'
  | 'externalId'
  | 'balance'
  | 'document'
  | 'ignore';

export type PreviewRow = {
  lineNumber: number;
  occurredOn: string;
  description: string;
  amountCents: string;
};

export type InspectionPayload = {
  hasProfile: true;
  format: 'csv' | 'ofx';
  encoding: string;
  repairedEncoding: boolean;
  fingerprint: string;
  dialect: { separator: string; hasHeader: boolean; decimalSeparator: string } | null;
  headers: string[] | null;
  mapping: { roles: ColumnRole[] } | null;
  rowCount: number;
  issueCount: number;
  duplicateExternalIds: number;
  periodStart: string | null;
  periodEnd: string | null;
  closingBalanceCents: string | null;
  closingBalanceAt: string | null;
  declaredAccount: { bankId: string | null; accountId: string | null; accountType: string | null } | null;
  currency: string | null;
  preview: PreviewRow[];
  issues: { lineNumber: number; severity: string; code: string; message: string }[];
  alreadyImported: { importBatchId: string; fileName: string | null; importedAt: string } | null;
  accounts: { id: string; name: string; currency: string; institutionName: string | null }[];
};

export type CommitPayload = {
  importBatchId: string;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  issueCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  balanceRecorded: boolean;
};

export type ImportStage =
  | { status: 'idle' }
  | { status: 'inspecting' }
  | { status: 'review'; inspection: InspectionPayload }
  | { status: 'committing'; inspection: InspectionPayload }
  | { status: 'done'; result: CommitPayload }
  | { status: 'noProfile' }
  | { status: 'error'; code: string; message: string };

const MESSAGE = 'O arquivo não pôde ser processado.';

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.publicMessage ?? MESSAGE };
  }
  return { code: 'UNEXPECTED', message: MESSAGE };
}

export function useImport() {
  const [stage, setStage] = useState<ImportStage>({ status: 'idle' });
  const [file, setFile] = useState<File | null>(null);

  const inspect = useCallback(
    async (candidate: File, overrides?: { roles?: ColumnRole[]; separator?: string; decimalSeparator?: string }) => {
      setFile(candidate);
      setStage({ status: 'inspecting' });

      const form = new FormData();
      form.set('file', candidate);
      // Lista vazia não é mapeamento: OFX não tem colunas, e `[]` é truthy —
      // enviá-lo faria o backend recusar a requisição por mapeamento inválido.
      if (overrides?.roles && overrides.roles.length > 0) {
        form.set('mapping', JSON.stringify({ roles: overrides.roles }));
      }
      if (overrides?.separator || overrides?.decimalSeparator) {
        form.set(
          'dialect',
          JSON.stringify({
            ...(overrides.separator ? { separator: overrides.separator } : {}),
            ...(overrides.decimalSeparator ? { decimalSeparator: overrides.decimalSeparator } : {}),
          }),
        );
      }

      try {
        const payload = await postForm<InspectionPayload | { hasProfile: false }>('/api/imports/inspect', form);
        if (!payload.hasProfile) {
          setStage({ status: 'noProfile' });
          return;
        }
        setStage({ status: 'review', inspection: payload });
      } catch (error) {
        setStage({ status: 'error', ...describe(error) });
      }
    },
    [],
  );

  const commit = useCallback(
    async (accountId: string, roles: ColumnRole[] | null) => {
      if (!file || stage.status !== 'review') return;
      const inspection = stage.inspection;
      setStage({ status: 'committing', inspection });

      const form = new FormData();
      form.set('file', file);
      form.set('accountId', accountId);
      if (roles && roles.length > 0) form.set('mapping', JSON.stringify({ roles }));
      if (inspection.dialect) {
        form.set(
          'dialect',
          JSON.stringify({
            separator: inspection.dialect.separator,
            hasHeader: inspection.dialect.hasHeader,
            decimalSeparator: inspection.dialect.decimalSeparator,
          }),
        );
      }

      try {
        const result = await postForm<CommitPayload>('/api/imports', form);
        setStage({ status: 'done', result });
      } catch (error) {
        const described = describe(error);
        // A recusa por duplicidade não é falha: volta para a revisão com o
        // aviso, para a pessoa escolher outro arquivo.
        setStage({ status: 'error', ...described });
      }
    },
    [file, stage],
  );

  const createProfile = useCallback(async () => {
    try {
      await postJson('/api/profile', {});
      setStage({ status: 'idle' });
    } catch (error) {
      setStage({ status: 'error', ...describe(error) });
    }
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setStage({ status: 'idle' });
  }, []);

  return { stage, file, inspect, commit, createProfile, reset };
}
