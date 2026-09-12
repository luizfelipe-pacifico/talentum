'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { deleteJson, getJson } from '@/lib/api-client';

/* Detalhe de um lote de importação, com reversão.

   `docs/HOW-IT-WORKS.md` exige poder desfazer o lote sem afetar alterações
   posteriores não relacionadas. A reversão remove apenas o que nasceu deste
   lote — e a tela diz isso antes de pedir a confirmação. */

type BatchPayload =
  | { hasProfile: false }
  | {
      hasProfile: true;
      batch: {
        id: string;
        format: string;
        status: string;
        fileName: string | null;
        periodStart: string | null;
        periodEnd: string | null;
        rowCount: number;
        importedCount: number;
        duplicateCount: number;
        importedAt: string;
        account: { id: string; name: string } | null;
        file: { originalName: string; byteSize: number; mediaType: string; encoding: string } | null;
        issues: { lineNumber: number; severity: string; code: string; message: string }[];
      };
    };

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; payload: Extract<BatchPayload, { hasProfile: true }> };

function shortDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function ImportBatchPage({ importBatchId }: { importBatchId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reverting, setReverting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getJson<BatchPayload>(`/api/imports/${encodeURIComponent(importBatchId)}`, controller.signal)
      .then((payload) => {
        if (!active) return;
        if (!payload.hasProfile) setState({ status: 'missing' });
        else setState({ status: 'ready', payload });
      })
      .catch((error) => {
        if (!active) return;
        setState({ status: error?.status === 404 ? 'missing' : 'error' });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [importBatchId]);

  const revert = useCallback(async () => {
    setReverting(true);
    try {
      await deleteJson(`/api/imports/${encodeURIComponent(importBatchId)}`);
      router.push('/extratos');
      router.refresh();
    } catch {
      setReverting(false);
      setState({ status: 'error' });
    }
  }, [importBatchId, router]);

  if (state.status === 'loading') {
    return (
      <section className="card" aria-busy="true">
        <span className="skeleton skeleton-eyebrow" />
        <span className="skeleton skeleton-metric" />
        <span className="skeleton skeleton-line" />
      </section>
    );
  }

  if (state.status === 'missing') {
    return (
      <section className="card card-lg empty">
        <i className="bi bi-file-earmark-x" aria-hidden="true" />
        <h2 className="h-display">Lote não encontrado</h2>
        <p className="muted">O backend não retornou um lote para este identificador.</p>
        <Link className="btn btn-neutral" href="/extratos">
          Voltar aos lançamentos
        </Link>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="card card-lg error-state" role="alert">
        <p className="eyebrow">Lote indisponível</p>
        <h2 className="h-display">Não foi possível consultar o banco local</h2>
        <Link className="btn btn-neutral" href="/extratos">
          Voltar aos lançamentos
        </Link>
      </section>
    );
  }

  const { batch } = state.payload;

  return (
    <div className="stack-lg">
      <section className="card card-lg">
        <p className="eyebrow">Lote de importação</p>
        <h2 className="h-display-lg">{batch.fileName ?? 'Extrato importado'}</h2>
        <p className="muted">
          Importado em {shortDate(batch.importedAt)} · formato {batch.format.toUpperCase()}
          {batch.account ? ` · conta ${batch.account.name}` : ''}
        </p>

        <dl className="spec-grid">
          <div>
            <dt>Lidos do arquivo</dt>
            <dd className="num">{batch.rowCount}</dd>
          </div>
          <div>
            <dt>Gravados</dt>
            <dd className="num">{batch.importedCount}</dd>
          </div>
          <div>
            <dt>Já existiam</dt>
            <dd className="num">{batch.duplicateCount}</dd>
          </div>
          <div>
            <dt>Período coberto</dt>
            <dd className="num">
              {shortDate(batch.periodStart)} – {shortDate(batch.periodEnd)}
            </dd>
          </div>
        </dl>

        {batch.file && (
          <p className="small muted">
            Arquivo de {(batch.file.byteSize / 1024).toFixed(1)} KB, codificação {batch.file.encoding}. O
            conteúdo do extrato não foi retido: apenas os lançamentos e estes metadados.
          </p>
        )}
      </section>

      {batch.issues.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2 className="h-display">Linhas não importadas</h2>
            <span className="small muted">Registradas para que nada seja omitido em silêncio.</span>
          </div>
          <table className="tbl tbl-data">
            <thead>
              <tr>
                <th scope="col">Linha</th>
                <th scope="col">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {batch.issues.map((issue) => (
                <tr key={`${issue.lineNumber}-${issue.code}`}>
                  <td className="num">{issue.lineNumber}</td>
                  <td>{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="h-display">Desfazer esta importação</h2>
        </div>
        <p className="muted">
          Remove os {batch.importedCount} lançamentos que nasceram deste lote e o saldo que ele
          registrou. Lançamentos de outros lotes não são afetados.
        </p>
        {confirming ? (
          <div className="row-tight">
            <button type="button" className="btn btn-danger" disabled={reverting} onClick={() => void revert()}>
              {reverting ? 'Desfazendo…' : 'Confirmar e desfazer'}
            </button>
            <button type="button" className="btn btn-neutral" disabled={reverting} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-neutral" onClick={() => setConfirming(true)}>
            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
            Desfazer importação
          </button>
        )}
      </section>
    </div>
  );
}
