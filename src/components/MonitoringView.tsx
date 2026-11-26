import { useMemo, useState } from 'react';
import { Search, Unlock } from 'lucide-react';
import { formatTime } from '../lib/api';
import type { DashboardSnapshot, SessionStatus } from '../types';
import { SessionStatusText } from './StatusIndicator';

interface MonitoringViewProps {
  snapshot: DashboardSnapshot;
  onSelectSession: (sessionId: string) => void;
}

const STATUS_FILTERS: Array<{ key: 'ALL' | SessionStatus; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'ACTIVE', label: 'Aktif' },
  { key: 'WARNING', label: 'Warning' },
  { key: 'LOCKED', label: 'Terkunci' },
  { key: 'COMPLETED', label: 'Selesai' },
  { key: 'NOT_STARTED', label: 'Belum Mulai' },
];

export function MonitoringView({ snapshot, onSelectSession }: MonitoringViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SessionStatus>('ALL');
  const [examFilter, setExamFilter] = useState('ALL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.sessions.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (examFilter !== 'ALL' && s.exam_id !== examFilter) return false;
      if (!q) return true;
      return (
        s.student_nama.toLowerCase().includes(q) ||
        s.student_nis.toLowerCase().includes(q) ||
        s.student_kelas.toLowerCase().includes(q) ||
        s.exam_nama.toLowerCase().includes(q)
      );
    });
  }, [snapshot.sessions, search, statusFilter, examFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Monitoring Peserta Realtime</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Pembaruan status otomatis melalui WebSocket. Klik peserta untuk memeriksa log pelanggaran atau menerbitkan
          token buka kunci.
        </p>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === f.key
                  ? 'bg-white text-[#0B1F3A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            aria-label="Filter berdasarkan ujian"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Semua Ujian</option>
            {snapshot.exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.nama_ujian}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, NIS, atau kelas..."
              className="pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Full Monitoring Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Tidak ada sesi peserta yang cocok dengan filter saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nama & NIS</th>
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Waktu Mulai</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Pelanggaran</th>
                  <th className="py-3 px-4">Aktivitas Terakhir</th>
                  <th className="py-3 px-4 text-right">Waktu Aktivitas</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((s) => (
                  <tr
                    key={s.session_id}
                    className={`hover:bg-slate-50 transition-colors ${
                      s.status === 'LOCKED' ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{s.student_nama}</div>
                      <div className="text-slate-500 font-mono mt-0.5">{s.student_nis}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-medium">{s.student_kelas}</div>
                      <div className="text-slate-500 truncate max-w-[180px]">{s.exam_mapel}</div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatTime(s.started_at)}
                    </td>
                    <td className="py-3 px-4">
                      <SessionStatusText status={s.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                      <span
                        className={
                          s.violation_count >= 3
                            ? 'text-red-700'
                            : s.violation_count > 0
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }
                      >
                        {s.violation_count}/3
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 max-w-xs truncate">{s.last_activity}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {formatTime(s.last_activity_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectSession(s.session_id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                          s.status === 'LOCKED'
                            ? 'bg-red-700 hover:bg-red-800 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                        }`}
                      >
                        {s.status === 'LOCKED' && <Unlock className="w-3.5 h-3.5" />}
                        {s.status === 'LOCKED' ? 'Buka Kunci' : 'Detail'}
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
