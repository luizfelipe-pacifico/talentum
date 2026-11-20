'use client';

import Link from 'next/link';
import { NotificationList } from '@/components/notifications';
import { StateArt } from '@/components/state-art';

/* Lista completa da central (/notificacoes). O painel do sino mostra as 20
   primeiras; aqui estão todas, com o mesmo filtro e as mesmas ações. */

export function NotificationsScreen() {
  return (
    <section className="card card-lg">
      <div className="card-header">
        <div>
          <h2 className="h-display">Central de notificações</h2>
          <p className="small muted">Avisos gerados a partir dos seus dados neste computador. Nada é enviado para fora dele.</p>
        </div>
        <Link className="btn btn-sm btn-neutral" href="/configuracoes#notificacoes">
          <i className="bi bi-sliders" aria-hidden="true" />
          Preferências de notificação
        </Link>
      </div>
      <NotificationList
        variant="page"
        empty={
          <div className="empty">
            <StateArt name="sem-notificacoes" />
            <h3 className="h-display">Nenhuma notificação</h3>
            <p className="muted">Quando uma obrigação estiver para vencer, a conciliação tiver pendências ou um extrato ficar antigo, o aviso aparece aqui.</p>
          </div>
        }
      />
    </section>
  );
}
