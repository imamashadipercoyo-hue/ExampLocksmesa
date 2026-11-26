import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Lock, ShieldAlert, Unlock, X } from 'lucide-react';
import { ApiError, apiRequest, formatDateTime, formatTime } from '../lib/api';
import type { ActivityLog, Exam, ExamSession, Student, TokenRecord, Violation } from '../types';
import { formatViolationLabel, SessionStatusText, TokenStatusText } from './StatusIndicator';

interface SessionDetailResponse {
  session: ExamSession;
  student: Student | undefined;
  exam: Exam | undefined;
  violations: Violation[];
  activities: ActivityLog[];
  tokens: TokenRecord[];
}

interface SessionDetailModalProps {
  sessionId: string | null;
  authToken: string;
  onClose: () => void;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

export function SessionDetailModal({
  sessionId,
  authToken,
  onClose,
  onNotify,
}: SessionDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [error, setError] = useState('');
  const [expiryMinutes, setExpiryMinutes] = useState(30);
  const [unlocking, setUnlocking] = useState(false);
  const [issuedToken, setIssuedToken] = useState<TokenRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchDetail = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<SessionDetailResponse>(`/api/sessions/${id}/detail`, {
        token: authToken,
      });
      setDetail(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memuat detail peserta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      setIssuedToken(null);
      return;
    }
    setIssuedToken(null);
    void fetchDetail(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (!sessionId) return null;

  async function handleUnlock() {
    if (!sessionId) return;
    setUnlocking(true);
    setError('');
    try {
      const res = await apiRequest<{ token: TokenRecord; session: ExamSession }>(
        `/api/sessions/${sessionId}/unlock`,
        {
          method: 'POST',
          token: authToken,
          body: { expiry_minutes: expiryMinutes },
        }
      );
      setIssuedToken(res.token);
      onNotify(
        'success',
        `Token baru ${res.token.code} berhasil diterbitkan khusus untuk ${detail?.student?.nama || 'peserta'}.`
      );
      await fetchDetail(sessionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal membuka kunci peserta.');
    } finally {
      setUnlocking(false);
    }
  }

  function handleCopy(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-base font-bold">Detail Peserta & Buka Kunci Ujian</h2>
            <p className="text-xs text-blue-200 mt-0.5">
              Pemeriksaan log pelanggaran serta penerbitan token baru khusus siswa
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Tutup detail"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && !detail ? (
            <div className="py-12 text-center text-sm text-slate-500">Memuat data peserta...</div>
          ) : error && !detail ? (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          ) : detail ? (
            <>
              {error && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {error}
                </div>
              )}

              {/* Identity & Status Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-slate-200">
                <div className="sm:col-span-2 space-y-1">
                  <div className="text-xs text-slate-500">
                    NIS <span className="font-mono text-slate-700">{detail.student?.nis || '-'}</span> ·{' '}
                    {detail.student?.kelas || '-'} · {detail.student?.jurusan || '-'}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{detail.student?.nama || 'Peserta'}</h3>
                  <div className="text-xs text-slate-600">
                    Ujian: <strong className="text-slate-900">{detail.exam?.nama_ujian || '-'}</strong>
                  </div>
                </div>
                <div className="flex flex-col sm:items-end justify-center gap-1.5">
                  <SessionStatusText status={detail.session.status} />
                  <div className="text-xs text-slate-600 tabular-nums">
                    Pelanggaran: <strong className="font-mono text-slate-900">{detail.session.violation_count}</strong> ·
                    Buka Kunci: <strong className="font-mono text-slate-900">{detail.session.unlocked_count}x</strong>
                  </div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    Mulai: {formatTime(detail.session.started_at)}
                  </div>
                </div>
              </div>

              {/* Newly Issued Token Callout */}
              {issuedToken && (
                <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-300 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                      <KeyRound className="w-4 h-4" />
                      Token Baru Berhasil Diterbitkan
                    </div>
                    <span className="text-xs text-emerald-800 font-mono">
                      Berlaku s/d {formatTime(issuedToken.expires_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-white border border-emerald-200 rounded-lg px-4 py-3">
                    <code className="text-xl font-mono font-bold tracking-widest text-[#0B1F3A]">
                      {issuedToken.code}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopy(issuedToken.code)}
                      className="px-3 py-1.5 rounded-md bg-[#0B1F3A] hover:bg-blue-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Tersalin' : 'Salin Token'}
                    </button>
                  </div>
                  <p className="text-xs text-emerald-900">
                    Token lama otomatis <strong>INVALID</strong>. Token baru ini hanya dapat dipakai oleh{' '}
                    <strong>{detail.student?.nama}</strong> ({detail.student?.nis}). Diterbitkan oleh{' '}
                    <strong>{issuedToken.issued_by}</strong> pada {formatDateTime(issuedToken.issued_at)}.
                  </p>
                </div>
              )}

              {/* Unlock Action Box */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    {detail.session.status === 'LOCKED' ? (
                      <Lock className="w-4 h-4 text-red-600" />
                    ) : (
                      <Unlock className="w-4 h-4 text-blue-700" />
                    )}
                    Buka Kunci & Terbitkan Token Baru
                  </div>
                  <p className="text-xs text-slate-600">
                    Token lama akan otomatis dinonaktifkan. Token baru terikat eksklusif pada peserta ini dan mencatat
                    nama pengawas serta waktu penerbitan.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <select
                    value={expiryMinutes}
                    onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                    aria-label="Masa berlaku token baru"
                    className="px-2.5 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value={15}>15 menit</option>
                    <option value={30}>30 menit</option>
                    <option value={60}>60 menit</option>
                    <option value={120}>120 menit</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleUnlock}
                    disabled={unlocking}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    {unlocking ? 'Memproses...' : 'BUKA KUNCI'}
                  </button>
                </div>
              </div>

              {/* Violations List */}
              <div className="space-y-2.5">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  Riwayat Pelanggaran ({detail.violations.length})
                </h4>
                {detail.violations.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">Belum ada pelanggaran tercatat pada sesi ini.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                          <th className="py-2.5 px-3">Ke-</th>
                          <th className="py-2.5 px-3">Event Terdeteksi</th>
                          <th className="py-2.5 px-3">Keterangan</th>
                          <th className="py-2.5 px-3 text-right">Waktu Server</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {detail.violations.map((v) => (
                          <tr key={v.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono font-bold text-red-700 tabular-nums">
                              #{v.violation_number}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900">
                              {formatViolationLabel(v.event_type)}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">{v.detail}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-500 tabular-nums whitespace-nowrap">
                              {formatDateTime(v.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Token History for this participant */}
              <div className="space-y-2.5">
                <h4 className="text-sm font-bold text-slate-900">Riwayat Token Peserta ({detail.tokens.length})</h4>
                {detail.tokens.length === 0 ? (
                  <p className="text-xs text-slate-500">Belum ada riwayat token.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                          <th className="py-2.5 px-3">Kode Token</th>
                          <th className="py-2.5 px-3">Jenis</th>
                          <th className="py-2.5 px-3">Diterbitkan Oleh</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Waktu Terbit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {detail.tokens.map((t) => (
                          <tr key={t.id}>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">{t.code}</td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {t.is_unlock_token ? 'Token Buka Kunci' : 'Token Ujian'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{t.issued_by}</td>
                            <td className="py-2.5 px-3">
                              <TokenStatusText status={t.status} />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-500 tabular-nums">
                              {formatDateTime(t.issued_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
