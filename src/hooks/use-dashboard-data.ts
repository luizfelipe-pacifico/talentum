'use client';

import { useEffect, useState } from 'react';

export type DashboardData = {
  hasFinancialData: boolean;
  balance: string;
  monthExpenses: string;
  dailyAverage: string;
  accountCount: number;
  transactionCount: number;
  pendingCount: number;
  importCount: number;
};

const emptyData: DashboardData = {
  hasFinancialData: false,
  balance: 'R$ 0,00',
  monthExpenses: 'R$ 0,00',
  dailyAverage: 'R$ 0,00',
  accountCount: 0,
  transactionCount: 0,
  pendingCount: 0,
  importCount: 0,
};

export function useDashboardData() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const codeResponse = await fetch('/api/action-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'GET', path: '/api/dashboard' }),
        });
        if (!codeResponse.ok) throw new Error('ACTION_CODE_FAILED');
        const { actionCode } = (await codeResponse.json()) as { actionCode: string };
        const response = await fetch('/api/dashboard', { headers: { 'X-Action-Code': actionCode }, cache: 'no-store' });
        if (!response.ok) throw new Error('DASHBOARD_FAILED');
        if (active) setData((await response.json()) as DashboardData);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  return { data, loading, error };
}
