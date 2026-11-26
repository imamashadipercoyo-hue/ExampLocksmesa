import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { ApiError, apiRequest, formatDateTime } from '../lib/api';
import type { AuditLog } from '../types';

interface AuditLogViewProps {
  authToken: string;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

export function AuditLogView({ authToken, onNotify }: AuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ audit_logs: AuditLog[] }>('/api/admin/audit-logs', {
        token: authToken,
      });
      setLogs(res.audit_logs);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal memuat audit log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const actions = useMemo(() => {
    const s = new Set(logs.map((l) => l.action));
    return Array.from(s).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter !== 'ALL' && l.action !== actionFilter) return false;
      if (!q) return true;
      return (
        l.actor_name.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
      );
    });
  }, [logs, actionFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Audit Log Sistem</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Rekaman lengkap seluruh tindakan penting: login, validasi token, mulai ujian, fullscreen, pelanggaran,
            warning, lock, generate token, unlock, token baru, selesai ujian, dan sinkronisasi Sheet.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchLogs}
          className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Filter aksi audit"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Semua Tindakan</option>
            {actions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 font-mono tabular-nums">{filtered.length} entri</span>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari aktor, tindakan, atau ringkasan..."
            className="pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">Memuat audit log...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">Belum ada catatan audit pada filter ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Waktu Server</th>
                  <th className="py-3 px-4">Tindakan</th>
                  <th className="py-3 px-4">Aktor & Peran</th>
                  <th className="py-3 px-4">Ringkasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {formatDateTime(item.created_at)}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-blue-800 whitespace-nowrap">
                      {item.action}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-900">{item.actor_name}</span>{' '}
                      <span className="text-slate-400">· {item.actor_role}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{item.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
