import { useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, KeyRound, Plus, RefreshCw, XCircle } from 'lucide-react';
import { ApiError, apiRequest, formatDateTime } from '../lib/api';
import type { DashboardSnapshot, TokenStatus } from '../types';
import { TokenStatusText } from './StatusIndicator';

interface TokensViewProps {
  snapshot: DashboardSnapshot;
  authToken: string;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

export function TokensView({ snapshot, authToken, onNotify }: TokensViewProps) {
  const [examId, setExamId] = useState(snapshot.exams[0]?.id || '');
  const [studentId, setStudentId] = useState('');
  const [expiryMinutes, setExpiryMinutes] = useState(120);
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'ALL' | TokenStatus>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredTokens = useMemo(() => {
    return snapshot.tokens.filter((t) => (statusFilter === 'ALL' ? true : t.status === statusFilter));
  }, [snapshot.tokens, statusFilter]);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    const targetExam = examId || snapshot.exams[0]?.id;
    if (!targetExam) {
      onNotify('warning', 'Buat jadwal ujian terlebih dahulu sebelum menerbitkan token.');
      return;
    }
    setGenerating(true);
    try {
      const res = await apiRequest<{ tokens: Array<{ code: string }> }>('/api/tokens/generate', {
        method: 'POST',
        token: authToken,
        body: {
          exam_id: targetExam,
          student_id: studentId || null,
          expiry_minutes: expiryMinutes,
          count: studentId ? 1 : count,
        },
      });
      onNotify('success', `Berhasil membuat ${res.tokens.length} token unik baru.`);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal membuat token.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggleStatus(id: string, nextStatus: 'ACTIVE' | 'INVALID') {
    try {
      await apiRequest(`/api/tokens/${id}/status`, {
        method: 'PATCH',
        token: authToken,
        body: { status: nextStatus },
      });
      onNotify('info', nextStatus === 'INVALID' ? 'Token dibatalkan (INVALID).' : 'Token diaktifkan kembali.');
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal memperbarui status token.');
    }
  }

  function handleCopy(id: string, code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Manajemen Token Ujian</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Setiap token bersifat unik, memiliki masa berlaku, tidak dapat dipakai dua siswa, dan otomatis invalid jika
          sesi dikunci.
        </p>
      </div>

      {/* Generate Token Form */}
      <form
        onSubmit={handleGenerate}
        className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
      >
        <div className="md:col-span-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Pilih Ujian</label>
          <select
            required
            value={examId || snapshot.exams[0]?.id || ''}
            onChange={(e) => setExamId(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {snapshot.exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.nama_ujian} ({ex.kelas})
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Target Siswa (Opsional)
          </label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">Umum (Terikat pada siswa pertama)</option>
            {snapshot.students
              .filter((s) => s.status === 'AKTIF')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nis} — {s.nama} ({s.kelas})
                </option>
              ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Masa Berlaku</label>
          <select
            value={expiryMinutes}
            onChange={(e) => setExpiryMinutes(Number(e.target.value))}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value={30}>30 Menit</option>
            <option value={60}>60 Menit</option>
            <option value={120}>2 Jam</option>
            <option value={240}>4 Jam</option>
          </select>
        </div>

        <div className="md:col-span-1">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jumlah</label>
          <input
            type="number"
            min={1}
            max={50}
            disabled={Boolean(studentId)}
            value={studentId ? 1 : count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={generating}
            className="w-full py-2 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {generating ? 'Membuat...' : 'Generate Token'}
          </button>
        </div>
      </form>

      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {(['ALL', 'ACTIVE', 'USED', 'INVALID', 'EXPIRED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                statusFilter === st ? 'bg-white text-[#0B1F3A] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'ALL' ? 'Semua' : st}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 font-mono tabular-nums">{filteredTokens.length} token</span>
      </div>

      {/* Token Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredTokens.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">Belum ada token pada kategori ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Kode Token</th>
                  <th className="py-3 px-4">Ujian</th>
                  <th className="py-3 px-4">Pengguna / Khusus Siswa</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Penerbit</th>
                  <th className="py-3 px-4 text-right">Berlaku Hingga</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredTokens.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                        <span className="font-mono font-bold text-slate-900 tracking-wider">{t.code}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(t.id, t.code)}
                          className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                          aria-label={`Salin token ${t.code}`}
                        >
                          {copiedId === t.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      {t.is_unlock_token && (
                        <div className="text-[11px] text-amber-700 font-medium mt-0.5">Token Buka Kunci</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate">{t.exam_nama}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {t.used_by_student_nama ? (
                        <span>
                          Dipakai: <strong className="text-slate-900">{t.used_by_student_nama}</strong> (
                          {t.used_by_student_nis})
                        </span>
                      ) : t.assigned_student_nama ? (
                        <span>
                          Khusus: <strong className="text-slate-900">{t.assigned_student_nama}</strong> (
                          {t.assigned_student_nis})
                        </span>
                      ) : (
                        <span className="text-slate-400">Belum digunakan</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <TokenStatusText status={t.status} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-medium">{t.issued_by}</div>
                      <div className="text-slate-400 text-[11px] font-mono tabular-nums">
                        {formatDateTime(t.issued_at)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatDateTime(t.expires_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {t.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(t.id, 'INVALID')}
                          className="px-2.5 py-1 rounded-md text-red-700 hover:bg-red-50 border border-red-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Batalkan
                        </button>
                      ) : t.status === 'INVALID' || t.status === 'EXPIRED' ? (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(t.id, 'ACTIVE')}
                          className="px-2.5 py-1 rounded-md text-emerald-700 hover:bg-emerald-50 border border-emerald-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Aktifkan
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
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
