import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  PlayCircle,
  ShieldAlert,
  Unlock,
  Users,
} from 'lucide-react';
import { formatTime } from '../lib/api';
import type { DashboardSnapshot, StaffUser } from '../types';
import { SessionStatusText } from './StatusIndicator';

interface DashboardOverviewProps {
  snapshot: DashboardSnapshot;
  user: StaffUser;
  onSelectSession: (sessionId: string) => void;
  onNavigate: (tab: string) => void;
}

export function DashboardOverview({
  snapshot,
  user,
  onSelectSession,
  onNavigate,
}: DashboardOverviewProps) {
  const { stats, sessions, activities } = snapshot;

  const statCards = [
    { label: 'Total Peserta', value: stats.total_peserta, icon: Users, tone: 'text-[#0B1F3A]' },
    { label: 'Belum Mulai', value: stats.belum_mulai, icon: Clock, tone: 'text-slate-600' },
    { label: 'Peserta Aktif', value: stats.aktif, icon: PlayCircle, tone: 'text-emerald-700' },
    { label: 'Warning', value: stats.warning, icon: AlertTriangle, tone: 'text-amber-700' },
    { label: 'Terkunci', value: stats.terkunci, icon: Lock, tone: 'text-red-700' },
    { label: 'Selesai', value: stats.selesai, icon: CheckCircle2, tone: 'text-blue-700' },
    { label: 'Total Pelanggaran', value: stats.jumlah_pelanggaran, icon: ShieldAlert, tone: 'text-red-700' },
  ];

  const lockedSessions = sessions.filter((s) => s.status === 'LOCKED');

  return (
    <div className="space-y-6">
      {/* Contextual Role Banner (Clear distinction between Pengawas & Admin) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">
            {user.role === 'ADMIN' ? 'Dashboard Administrator' : 'Dashboard Pengawas Ruang'}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {user.role === 'ADMIN'
              ? 'Kontrol penuh sistem ujian, Master Siswa, sinkronisasi Google Sheet, audit log, dan monitoring realtime.'
              : 'Pemantauan peserta ujian langsung tanpa refresh, manajemen token ruang, dan buka kunci peserta terkunci.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('tokens')}
            className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            Kelola Token
          </button>
          <button
            type="button"
            onClick={() => onNavigate('monitoring')}
            className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            Monitoring Penuh
          </button>
        </div>
      </div>

      {/* Urgent Locked Participants Action Strip (Only when locked participants exist) */}
      {lockedSessions.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-red-900">
                {lockedSessions.length} Peserta Sedang Terkunci & Membutuhkan Token Baru
              </div>
              <p className="text-xs text-red-800 mt-0.5">
                {lockedSessions.map((s) => `${s.student_nama} (${s.student_kelas})`).join(', ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectSession(lockedSessions[0].session_id)}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
          >
            <Unlock className="w-3.5 h-3.5" />
            Periksa & Buka Kunci
          </button>
        </div>
      )}

      {/* 7 Realtime Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3.5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-2"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span className="truncate">{card.label}</span>
                <Icon className={`w-4 h-4 shrink-0 ${card.tone}`} />
              </div>
              <div className={`text-2xl font-extrabold font-mono tabular-nums ${card.tone}`}>
                {card.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Split: Live Monitoring Table + Recent Activity Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Realtime Monitoring Table */}
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Monitoring Peserta Realtime</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Status berubah otomatis tanpa refresh saat peserta masuk, warning, atau terkunci
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('monitoring')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
            >
              Lihat Semua →
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Belum ada peserta yang memulai sesi ujian.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Peserta</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Pelanggaran</th>
                    <th className="py-3 px-4">Aktivitas Terakhir</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {sessions.slice(0, 10).map((s) => (
                    <tr key={s.session_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{s.student_nama}</div>
                        <div className="text-slate-500 mt-0.5">
                          <span className="font-mono">{s.student_nis}</span> · {s.student_kelas}
                        </div>
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
                      <td className="py-3 px-4 max-w-xs">
                        <div className="text-slate-700 truncate">{s.last_activity}</div>
                        <div className="text-slate-400 font-mono tabular-nums mt-0.5">
                          {formatTime(s.last_activity_at)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectSession(s.session_id)}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                            s.status === 'LOCKED'
                              ? 'bg-red-700 hover:bg-red-800 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                          }`}
                        >
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

        {/* Live Recent Activity Feed */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Aktivitas Terbaru</h2>
              <p className="text-xs text-slate-500 mt-0.5">Umpan kejadian langsung dari ruang ujian</p>
            </div>
          </div>

          {activities.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">Belum ada aktivitas tercatat.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
              {activities.slice(0, 18).map((act) => (
                <div key={act.id} className="px-5 py-3.5 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 truncate">{act.actor_name}</span>
                    <span className="font-mono text-slate-400 tabular-nums shrink-0">
                      {formatTime(act.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{act.activity}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
