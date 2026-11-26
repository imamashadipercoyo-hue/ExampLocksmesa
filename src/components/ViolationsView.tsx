import { useMemo, useState } from 'react';
import { Info, Search } from 'lucide-react';
import { formatDateTime } from '../lib/api';
import type { DashboardSnapshot, ViolationType } from '../types';
import { formatViolationLabel, SessionStatusText } from './StatusIndicator';

interface ViolationsViewProps {
  snapshot: DashboardSnapshot;
  onSelectSession: (sessionId: string) => void;
}

const EVENT_TYPES: Array<{ key: 'ALL' | ViolationType; label: string }> = [
  { key: 'ALL', label: 'Semua Event' },
  { key: 'tab_switch', label: 'tab_switch' },
  { key: 'window_blur', label: 'window_blur' },
  { key: 'fullscreen_exit', label: 'fullscreen_exit' },
  { key: 'page_visibility_hidden', label: 'page_visibility_hidden' },
  { key: 'attempt_leave_page', label: 'attempt_leave_page' },
  { key: 'session_reconnect', label: 'session_reconnect' },
];

export function ViolationsView({ snapshot, onSelectSession }: ViolationsViewProps) {
  const [eventFilter, setEventFilter] = useState<'ALL' | ViolationType>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.violations.filter((v) => {
      if (eventFilter !== 'ALL' && v.event_type !== eventFilter) return false;
      if (!q) return true;
      return (
        v.student_nama.toLowerCase().includes(q) ||
        v.student_nis.toLowerCase().includes(q) ||
        v.student_kelas.toLowerCase().includes(q) ||
        v.detail.toLowerCase().includes(q)
      );
    });
  }, [snapshot.violations, eventFilter, search]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Log Pelanggaran Langsung</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Catatan seluruh event anomali browser yang dilaporkan secara server-side beserta timestamp server.
        </p>
      </div>

      {/* Honest Browser-Level Monitoring Notice */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <span>
          Sistem hanya mendeteksi dan mencatat event yang tersedia melalui API browser (
          <code className="font-mono text-blue-900">tab_switch</code>,{' '}
          <code className="font-mono text-blue-900">window_blur</code>,{' '}
          <code className="font-mono text-blue-900">fullscreen_exit</code>,{' '}
          <code className="font-mono text-blue-900">page_visibility_hidden</code>,{' '}
          <code className="font-mono text-blue-900">attempt_leave_page</code>, dan{' '}
          <code className="font-mono text-blue-900">session_reconnect</code>). Website tidak mengklaim dapat
          mengontrol penuh sistem operasi atau mendeteksi penggunaan perangkat lain di luar browser.
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value as 'ALL' | ViolationType)}
            aria-label="Filter jenis pelanggaran"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {EVENT_TYPES.map((ev) => (
              <option key={ev.key} value={ev.key}>
                {ev.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {filtered.length} catatan pelanggaran
          </span>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari siswa, NIS, atau keterangan..."
            className="pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Belum ada catatan pelanggaran untuk filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Waktu Server</th>
                  <th className="py-3 px-4">Peserta</th>
                  <th className="py-3 px-4">Event Pelanggaran</th>
                  <th className="py-3 px-4 text-right">Ke-</th>
                  <th className="py-3 px-4">Status Sesi</th>
                  <th className="py-3 px-4">Detail</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {formatDateTime(v.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{v.student_nama}</div>
                      <div className="text-slate-500 mt-0.5">
                        <span className="font-mono">{v.student_nis}</span> · {v.student_kelas}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {formatViolationLabel(v.event_type)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-red-700">
                      #{v.violation_number}
                    </td>
                    <td className="py-3 px-4">
                      <SessionStatusText status={v.resulting_status} />
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{v.detail}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectSession(v.session_id)}
                        className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors"
                      >
                        Buka Detail
                      </button>
                    </td>
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
