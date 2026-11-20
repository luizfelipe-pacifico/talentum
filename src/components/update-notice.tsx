'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-state';
import { StateArt } from '@/components/state-art';
import { getJson, postJson } from '@/lib/api-client';
import { trapFocus } from '@/lib/focus-trap';

/* Aviso de nova versão (docs/PRODUCT.md, "New-version notice").

   O backend local consulta o repositório oficial e diz se há versão estável
   mais nova e se o aviso deve aparecer (a pessoa pode ter adiado). Regras da
   especificação que vivem aqui:

   - abre no máximo uma vez por sessão para a mesma versão;
   - nunca durante uma importação nem por cima de outro diálogo: espera;
   - `Adiar` grava o adiamento de 24 horas no backend;
   - `Baixar agora` pede ao processo principal do Electron que baixe, confira o
     SHA-256 e a assinatura e só então execute o instalador. No navegador, ou
     quando a verificação recusa, leva à página da versão no GitHub. */

type Release = { version: string; notes: string; releaseUrl: string };
type Check =
  | { status: 'update-available'; currentVersion: string; release: Release; notify: boolean }
  | { status: 'up-to-date' | 'unavailable'; currentVersion: string; notify: false };
type Install = 'idle' | 'working' | 'installing' | 'unsigned' | 'rejected' | 'failed' | 'external';

const RECHECK_MS = 6 * 60 * 60 * 1000;
const seenKey = (version: string) => `talentum:aviso-versao:${version}`;

function alreadySeen(version: string) {
  try {
    return window.sessionStorage.getItem(seenKey(version)) === '1';
  } catch {
    return false;
  }
}

function markSeen(version: string) {
  try {
    window.sessionStorage.setItem(seenKey(version), '1');
  } catch {
    // Sem armazenamento da sessão, o aviso pode reaparecer ao recarregar; o adiamento no backend continua valendo.
  }
}

export function UpdateNotice() {
  const app = useApp();
  const pathname = usePathname();
  const [pending, setPending] = useState<(Check & { status: 'update-available' }) | null>(null);
  const [open, setOpen] = useState(false);
  const [install, setInstall] = useState<Install>('idle');
  const trapRef = useRef<HTMLDivElement>(null);

  const check = useCallback(() => {
    getJson<Check>('/api/updates')
      .then((result) => {
        if (result.status === 'update-available' && result.notify && !alreadySeen(result.release.version)) setPending(result);
      })
      .catch(() => {
        // Falha silenciosa: sem rede ou sem resposta, nada aparece (docs/PRODUCT.md).
      });
  }, []);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [check]);

  // Espera a importação terminar e nenhum outro diálogo estar aberto.
  const busyElsewhere = pathname.startsWith('/extratos/importar') || app.overlay !== null;
  useEffect(() => {
    if (pending && !open && !busyElsewhere) {
      setOpen(true);
      markSeen(pending.release.version);
    }
  }, [pending, open, busyElsewhere]);

  useEffect(() => (open && trapRef.current ? trapFocus(trapRef.current) : undefined), [open]);

  const close = useCallback(() => {
    setOpen(false);
    setPending(null);
    setInstall('idle');
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && install !== 'working') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, install, close]);

  if (!open || !pending) return null;
  const { release, currentVersion } = pending;

  async function postpone() {
    try {
      await postJson('/api/updates/postpone', { version: release.version });
    } catch {
      // O aviso já não volta nesta sessão; sem o adiamento gravado, ele volta na próxima.
    }
    close();
  }

  async function downloadNow() {
    const installer = window.talentumWindow?.installUpdate;
    if (!installer) {
      setInstall('external');
      return;
    }
    setInstall('working');
    try {
      const result = await installer(release.version);
      if (result.status === 'installing') setInstall('installing');
      else if (result.status === 'unsupported-platform') setInstall('external');
      else if (result.status === 'refused' && result.reason === 'SIGNING_KEY_MISSING') setInstall('unsigned');
      else if (result.status === 'refused') setInstall('rejected');
      else setInstall('failed');
    } catch {
      setInstall('failed');
    }
  }

  const message: Record<Exclude<Install, 'idle'>, string> = {
    working: 'Baixando e conferindo o instalador. Não feche o Talentum.',
    installing: `Instalador da versão ${release.version} conferido. O Talentum vai fechar; conclua a instalação na janela que abrir.`,
    unsigned: 'Esta versão ainda não pode ser instalada por aqui: o Talentum só executa instaladores com assinatura conferida, e a chave de assinatura das versões ainda não existe. Baixe pela página da versão e confira o SHA-256 antes de executar.',
    rejected: 'O instalador baixado não passou na verificação de integridade e foi apagado. Nada foi instalado. Tente de novo mais tarde ou baixe pela página da versão.',
    failed: 'Não foi possível baixar o instalador. Nada foi instalado. Confira a conexão e tente de novo.',
    external: 'A instalação por aqui existe no Windows e no macOS. Baixe o arquivo da sua plataforma na página da versão.',
  };
  const linkOut = install === 'unsigned' || install === 'rejected' || install === 'external' || install === 'failed';

  return (
    <div className="overlay">
      <button type="button" className="overlay-scrim" aria-label="Fechar aviso de nova versão" onClick={() => install !== 'working' && close()} />
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="nova-versao-titulo" className="dialog dialog-md">
        <StateArt name="nova-versao" size="sm" />
        <h2 className="dialog-title" id="nova-versao-titulo">Nova versão disponível</h2>
        <p className="update-versions">
          <span>Versão instalada <strong>{currentVersion}</strong></span>
          <span>Nova versão <strong>{release.version}</strong></span>
        </p>
        {release.notes && <p className="update-notes">{release.notes}</p>}
        {install !== 'idle' && (
          <p className={`callout small ${install === 'installing' ? 'callout-ok' : install === 'working' ? 'callout-info' : 'callout-warn'}`} role="status">
            {message[install]}
          </p>
        )}
        <div className="row-tight">
          {linkOut ? (
            <a className="btn btn-primary" href={release.releaseUrl} target="_blank" rel="noreferrer noopener">Abrir a página da versão {release.version}</a>
          ) : (
            <button type="button" className="btn btn-primary" disabled={install === 'working' || install === 'installing'} onClick={downloadNow}>
              {install === 'working' ? 'Baixando…' : 'Baixar agora'}
            </button>
          )}
          {install !== 'installing' && (
            <button type="button" className="btn btn-neutral" disabled={install === 'working'} onClick={postpone}>Adiar</button>
          )}
        </div>
        {install === 'idle' && <p className="small muted">Adiar esconde este aviso por 24 horas para a versão {release.version}.</p>}
      </div>
    </div>
  );
}
