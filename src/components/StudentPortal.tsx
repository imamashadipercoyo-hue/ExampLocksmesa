import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Lock,
  LogOut,
  Maximize,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, apiRequest, getGoogleFormEmbedUrl } from '../lib/api';
import type {
  Exam,
  ExamSession,
  Student,
  StudentSessionPayload,
  ViolationResponse,
  ViolationType,
} from '../types';
import { BrandMark } from './BrandMark';

interface PublicExamItem {
  id: string;
  nama_ujian: string;
  mata_pelajaran: string;
  kelas: string;
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  durasi: number;
  status: string;
}

interface StudentPortalProps {
  onOpenStaffLogin: () => void;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

type PortalStage = 'GATE' | 'INSTRUCTIONS' | 'ACTIVE_EXAM' | 'LOCKED' | 'COMPLETED';

export function StudentPortal({ onOpenStaffLogin, onNotify }: StudentPortalProps) {
  const [stage, setStage] = useState<PortalStage>('GATE');
  const [showGuide, setShowGuide] = useState(false);

  // Public exam schedule list
  const [publicExams, setPublicExams] = useState<PublicExamItem[]>([]);
  const [nis, setNis] = useState('');
  const [tokenCode, setTokenCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Authenticated student session (Bearer token strictly in React memory — NEVER localStorage)
  const [bearerToken, setBearerToken] = useState<string | null>(null);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);

  // Warning modal state
  const [warningModal, setWarningModal] = useState<{
    level: 1 | 2;
    title: string;
    message: string;
  } | null>(null);

  // Unlock token input on LOCKED screen
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockReadyHint, setUnlockReadyHint] = useState('');
  const [unlockSubmitting, setUnlockSubmitting] = useState(false);

  // Exam timer
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Refs to prevent duplicate / false-positive violations
  const monitoringEnabledRef = useRef(false);
  const lastViolationTsRef = useRef<number>(0);
  const completingRef = useRef(false);
  const bearerRef = useRef<string | null>(null);
  const stageRef = useRef<PortalStage>('GATE');
  const pendingReturnNoticeRef = useRef<{
    level: 1 | 2;
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    bearerRef.current = bearerToken;
  }, [bearerToken]);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // Load public active exams for student reference
  useEffect(() => {
    apiRequest<{ exams: PublicExamItem[] }>('/api/public/exams')
      .then((res) => setPublicExams(res.exams))
      .catch(() => {
        // Silent fallback
      });
  }, []);

  // Countdown timer during ACTIVE_EXAM
  useEffect(() => {
    if (stage !== 'ACTIVE_EXAM' || !exam || !session?.started_at) return;
    const endMs = new Date(session.started_at).getTime() + exam.durasi * 60 * 1000;
    const tick = () => {
      const diff = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setRemainingSeconds(diff);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [stage, exam, session?.started_at]);

  // Student WebSocket connection (detects reconnects & receives proctor unlock notifications)
  useEffect(() => {
    if (!bearerToken || !session) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let hadConnectedOnce = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'auth', token: bearerToken }));
        if (hadConnectedOnce && stageRef.current === 'ACTIVE_EXAM') {
          void reportViolation('session_reconnect', 'Koneksi sesi ujian terputus lalu tersambung kembali');
        }
        hadConnectedOnce = true;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type?: string; message?: string };
          if (msg.type === 'student:unlock_ready' && msg.message) {
            setUnlockReadyHint(msg.message);
            onNotify('info', msg.message);
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearerToken, session?.session_id]);

  const reportViolation = useCallback(async (eventType: ViolationType, detail: string) => {
    if (!monitoringEnabledRef.current || completingRef.current) return;
    if (stageRef.current !== 'ACTIVE_EXAM') return;
    const token = bearerRef.current;
    if (!token) return;

    // Cooldown 1800ms so simultaneous blur + visibilitychange counts as 1 clear incident
    const now = Date.now();
    if (eventType !== 'session_reconnect' && now - lastViolationTsRef.current < 1800) {
      return;
    }
    lastViolationTsRef.current = now;

    try {
      const res = await apiRequest<ViolationResponse>('/api/student/violation', {
        method: 'POST',
        token,
        body: { event_type: eventType, detail },
      });
      if (!res.session) return;
      setSession(res.session);

      if (res.locked) {
        monitoringEnabledRef.current = false;
        setWarningModal(null);
        setStage('LOCKED');
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      } else {
        const notice = {
          level: res.warning_level as 1 | 2,
          title: res.modal_title,
          message: res.modal_message,
        };
        if (document.visibilityState === 'hidden') {
          pendingReturnNoticeRef.current = notice;
        } else {
          setWarningModal(notice);
        }
      }
    } catch {
      // Network hiccup handled on reconnect
    }
  }, []);

  // Browser Event Listeners for Active Exam Monitoring
  useEffect(() => {
    if (stage !== 'ACTIVE_EXAM') {
      monitoringEnabledRef.current = false;
      return;
    }

    // Small grace period after fullscreen enters so initial transition settles
    const enableTimer = setTimeout(() => {
      monitoringEnabledRef.current = true;
    }, 900);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void reportViolation(
          'tab_switch',
          'document.visibilityState menjadi hidden (peserta meninggalkan tab ujian)'
        );
      } else if (document.visibilityState === 'visible' && pendingReturnNoticeRef.current) {
        setWarningModal(pendingReturnNoticeRef.current);
        pendingReturnNoticeRef.current = null;
      }
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement && monitoringEnabledRef.current && !completingRef.current) {
        void reportViolation('fullscreen_exit', 'Peserta keluar dari mode Fullscreen saat ujian berlangsung');
      }
    };

    const onWindowBlur = () => {
      // Important: clicking inside the embedded Google Form iframe blurs the parent window
      // while document.activeElement becomes that IFRAME. Do NOT falsely penalize answering the form!
      setTimeout(() => {
        if (document.activeElement?.tagName === 'IFRAME') return;
        if (document.visibilityState === 'hidden') return; // Handled by visibilitychange
        void reportViolation('window_blur', 'Jendela browser ujian kehilangan fokus');
      }, 120);
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!monitoringEnabledRef.current || completingRef.current) return;
      void reportViolation('attempt_leave_page', 'Peserta mencoba menutup atau memuat ulang halaman ujian');
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      clearTimeout(enableTimer);
      monitoringEnabledRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [stage, reportViolation]);

  async function handleValidateToken(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = await apiRequest<StudentSessionPayload>('/api/student/validate-token', {
        method: 'POST',
        body: { nis, token_code: tokenCode },
      });
      setBearerToken(payload.token);
      setSession(payload.session);
      setStudent(payload.student);
      setExam(payload.exam);
      setStage('INSTRUCTIONS');
      onNotify('success', `Selamat datang, ${payload.student.nama}. Silakan baca petunjuk ujian.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal memvalidasi token ujian.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActivateFullscreen() {
    if (!bearerToken) return;
    setError('');
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      const res = await apiRequest<{ session: ExamSession }>('/api/student/fullscreen', {
        method: 'POST',
        token: bearerToken,
      });
      setSession(res.session);
      setWarningModal(null);
      setStage('ACTIVE_EXAM');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        // Fallback if sandboxed iframe blocks fullscreen API: still register start and notify clearly
        try {
          const res = await apiRequest<{ session: ExamSession }>('/api/student/fullscreen', {
            method: 'POST',
            token: bearerToken,
          });
          setSession(res.session);
          setWarningModal(null);
          setStage('ACTIVE_EXAM');
          onNotify('warning', 'Browser membatasi Fullscreen API. Monitoring tab & fokus tetap aktif.');
        } catch (innerErr) {
          setError(innerErr instanceof ApiError ? innerErr.message : 'Gagal memulai sesi ujian.');
        }
      }
    }
  }

  async function handleReturnToFullscreen() {
    setWarningModal(null);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        // ignore if blocked
      }
    }
    if (bearerToken) {
      apiRequest('/api/student/fullscreen', { method: 'POST', token: bearerToken }).catch(() => {});
    }
  }

  async function handleUnlockWithNewToken(e: FormEvent) {
    e.preventDefault();
    if (!bearerToken) return;
    setUnlockError('');
    setUnlockSubmitting(true);
    try {
      const res = await apiRequest<{ session: ExamSession; active_token_code: string }>(
        '/api/student/unlock-resume',
        {
          method: 'POST',
          token: bearerToken,
          body: { token_code: unlockCode },
        }
      );
      setSession(res.session);
      setUnlockCode('');
      setUnlockReadyHint('');
      setStage('INSTRUCTIONS');
      onNotify('success', 'Sesi berhasil dibuka kembali. Aktifkan Fullscreen untuk melanjutkan ujian.');
    } catch (err) {
      setUnlockError(err instanceof ApiError ? err.message : 'Token baru tidak valid.');
    } finally {
      setUnlockSubmitting(false);
    }
  }

  async function handleCompleteExam() {
    if (!bearerToken) return;
    completingRef.current = true;
    monitoringEnabledRef.current = false;
    try {
      const res = await apiRequest<{ session: ExamSession }>('/api/student/complete', {
        method: 'POST',
        token: bearerToken,
      });
      setSession(res.session);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setStage('COMPLETED');
      onNotify('success', 'Ujian Anda telah selesai dan tercatat di sistem.');
    } catch (err) {
      completingRef.current = false;
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal menyelesaikan ujian.');
    }
  }

  function resetToGate() {
    completingRef.current = false;
    monitoringEnabledRef.current = false;
    setBearerToken(null);
    setSession(null);
    setStudent(null);
    setExam(null);
    setNis('');
    setTokenCode('');
    setUnlockCode('');
    setWarningModal(null);
    setStage('GATE');
  }

  const formatCountdown = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  // =========================================================================
  // ACTIVE EXAM WORKSPACE (FULLSCREEN + GOOGLE FORM + WARNING MODALS)
  // =========================================================================
  if (stage === 'ACTIVE_EXAM' && exam && student && session) {
    const embedUrl = getGoogleFormEmbedUrl(exam.google_form_url);
    return (
      <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
        {/* Compact High-Contrast Exam Header */}
        <header className="h-14 shrink-0 bg-[#0B1F3A] text-white px-5 flex items-center justify-between gap-4 border-b border-blue-900">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark size="sm" />
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{exam.nama_ujian}</div>
              <div className="text-xs text-blue-200 truncate">
                {student.nama} · NIS {student.nis} · {student.kelas}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs text-blue-100">
              <span>Pelanggaran:</span>
              <span
                className={`font-mono tabular-nums font-bold ${
                  session.violation_count === 0
                    ? 'text-emerald-300'
                    : session.violation_count === 1
                    ? 'text-amber-300'
                    : 'text-red-300'
                }`}
              >
                {session.violation_count}/3
              </span>
            </div>

            <div className="flex items-center gap-1.5 font-mono tabular-nums text-sm font-semibold text-white bg-white/10 px-3 py-1 rounded-md">
              <Clock className="w-3.5 h-3.5 text-blue-300" />
              {formatCountdown(remainingSeconds)}
            </div>

            <button
              type="button"
              onClick={handleCompleteExam}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Selesai Ujian
            </button>
          </div>
        </header>

        {/* Embedded Google Form Area */}
        <main className="flex-1 relative bg-white">
          <iframe
            src={embedUrl}
            title={exam.nama_ujian}
            className="w-full h-full border-0"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
          />

          {/* Subtle bottom info bar for Google Form submission confirmation */}
          <div className="absolute bottom-3 left-3 right-3 pointer-events-none flex justify-end">
            <div className="pointer-events-auto bg-[#0B1F3A]/90 text-blue-100 text-xs px-3.5 py-2 rounded-lg shadow-md flex items-center gap-3">
              <span>Pastikan tombol Kirim (Submit) pada Google Form telah diklik sebelum klik Selesai Ujian.</span>
              <a
                href={exam.google_form_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline inline-flex items-center gap-1 whitespace-nowrap font-medium"
                onClick={() => {
                  // Clicking external link would trigger blur; warn user to stay inside iframe
                }}
              >
                <ExternalLink className="w-3 h-3" />
                Tautan Form
              </a>
            </div>
          </div>
        </main>

        {/* WARNING 1 / WARNING 2 MODAL */}
        {warningModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
              <div
                className={`px-6 py-4 flex items-center gap-3 text-white ${
                  warningModal.level === 2 ? 'bg-red-700' : 'bg-amber-600'
                }`}
              >
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight">{warningModal.title}</h2>
                  <p className="text-xs opacity-90">
                    Pelanggaran ke-{session.violation_count} dari batas maksimal 3 pelanggaran
                  </p>
                </div>
              </div>
              <div className="p-6 space-y-5">
                <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed font-medium">
                  {warningModal.message}
                </p>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  Jika terjadi pelanggaran hingga ke-3, sesi ujian Anda akan <strong>dikunci otomatis</strong> dan Anda
                  harus meminta <strong>TOKEN BARU</strong> kepada pengawas ruang.
                </div>
                <button
                  type="button"
                  onClick={handleReturnToFullscreen}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#0B1F3A] hover:bg-blue-900 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Maximize className="w-4 h-4" />
                  Kembali ke Mode Fullscreen & Lanjutkan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // LOCKED SCREEN (3RD VIOLATION)
  // =========================================================================
  if (stage === 'LOCKED' && student && exam) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center p-6">
        <div className="bg-white rounded-xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
          <div className="bg-red-700 text-white px-6 py-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">UJIAN TERKUNCI</h1>
              <p className="text-xs text-red-100 mt-1">
                Akses halaman soal dihentikan · Token sebelumnya otomatis invalid
              </p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-1">
              <p className="text-base font-semibold text-slate-900">
                Silakan hubungi pengawas untuk mendapatkan TOKEN BARU.
              </p>
              <p className="text-sm text-slate-600">
                Peserta: <strong className="text-slate-900">{student.nama}</strong> ({student.nis} · {student.kelas}) —{' '}
                {exam.nama_ujian}.
              </p>
            </div>

            {unlockReadyHint && (
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 font-medium flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-700" />
                <span>{unlockReadyHint}</span>
              </div>
            )}

            <form onSubmit={handleUnlockWithNewToken} className="space-y-3 pt-2 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700">
                Masukkan TOKEN BARU dari Pengawas
              </label>
              {unlockError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {unlockError}
                </div>
              )}
              <input
                type="text"
                required
                value={unlockCode}
                onChange={(e) => setUnlockCode(e.target.value.toUpperCase())}
                placeholder="Contoh: UNLK-XXXXXX"
                className="w-full px-4 py-3 text-base font-mono tracking-wider uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={unlockSubmitting}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {unlockSubmitting ? 'Memvalidasi Token Baru...' : 'Buka Kunci & Lanjutkan Ujian'}
              </button>
            </form>

            <div className="pt-2 flex justify-between items-center text-xs text-slate-500">
              <span>Status: TERKUNCI (3/3 Pelanggaran)</span>
              <button
                type="button"
                onClick={resetToGate}
                className="text-slate-600 hover:text-slate-900 underline inline-flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                Kembali ke Gerbang
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // COMPLETED SCREEN
  // =========================================================================
  if (stage === 'COMPLETED' && student && exam) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center border border-emerald-200">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-slate-900">Ujian Selesai</h1>
            <p className="text-sm text-slate-600">
              Terima kasih, <strong className="text-slate-900">{student.nama}</strong> ({student.nis}). Sesi ujian Anda
              pada <strong className="text-slate-900">{exam.nama_ujian}</strong> telah tercatat selesai.
            </p>
          </div>
          <div className="py-3 px-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-center gap-3">
            <span>Kelas: {student.kelas}</span>
            <span aria-hidden="true">·</span>
            <span>Total Pelanggaran: {session?.violation_count ?? 0}</span>
          </div>
          <button
            type="button"
            onClick={resetToGate}
            className="px-5 py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-blue-900 text-white text-sm font-semibold transition-colors"
          >
            Kembali ke Halaman Gerbang Siswa
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // INSTRUCTIONS & FULLSCREEN ACTIVATION STAGE
  // =========================================================================
  if (stage === 'INSTRUCTIONS' && student && exam) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
          <div className="text-base font-bold tracking-tight text-[#0B1F3A] whitespace-nowrap shrink-0">
            UJIAN LOCK SMESA
          </div>
          <div className="text-xs text-slate-500 hidden sm:block truncate">
            {student.nama} · NIS {student.nis} · {student.kelas}
          </div>
          <button
            type="button"
            onClick={resetToGate}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Keluar
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full overflow-hidden">
            <div className="bg-[#0B1F3A] text-white px-7 py-6 flex items-center gap-4">
              <BrandMark size="md" />
              <div>
                <h1 className="text-xl font-bold leading-snug">{exam.nama_ujian}</h1>
                <p className="text-xs text-blue-200 mt-1">
                  {exam.mata_pelajaran} · {exam.kelas} · Durasi {exam.durasi} Menit
                </p>
              </div>
            </div>

            <div className="p-7 space-y-6">
              {error && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-900">Petunjuk & Tata Tertib Ujian Online</h2>
                <ol className="space-y-2.5 text-sm text-slate-700 list-decimal pl-5">
                  <li>
                    Klik tombol <strong>AKTIFKAN FULLSCREEN</strong> untuk membuka lembar soal Google Form dalam layar
                    penuh.
                  </li>
                  <li>
                    Selama ujian berlangsung, dilarang berpindah tab browser, mengecilkan jendela, atau keluar dari mode
                    Fullscreen.
                  </li>
                  <li>
                    Pelanggaran ke-1 dan ke-2 akan memunculkan peringatan resmi dan dicatat langsung pada dashboard
                    pengawas.
                  </li>
                  <li>
                    Pelanggaran ke-3 akan <strong>mengunci sesi ujian secara otomatis</strong> dan membatalkan token
                    aktif Anda. Anda wajib melapor kepada pengawas untuk memperoleh <strong>TOKEN BARU</strong>.
                  </li>
                  <li>
                    Pastikan Anda telah menekan tombol <strong>Kirim (Submit)</strong> di dalam Google Form sebelum
                    menekan tombol <strong>Selesai Ujian</strong>.
                  </li>
                </ol>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <span>
                  Catatan Transparansi: Sistem monitoring berbasis browser ini mencatat event yang tersedia melalui API
                  browser (keluar layar penuh, perpindahan tab, kehilangan fokus jendela, dan sambung ulang sesi) untuk
                  membantu pengawas menjaga ketertiban ujian.
                </span>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
                <div className="text-xs text-slate-500">
                  Peserta terverifikasi: <strong className="text-slate-900">{student.nama}</strong> ({student.nis})
                </div>
                <button
                  type="button"
                  onClick={handleActivateFullscreen}
                  className="w-full sm:w-auto px-6 py-3 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                >
                  <Maximize className="w-4 h-4" />
                  AKTIFKAN FULLSCREEN
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // DEFAULT STAGE: STUDENT EXAM GATE (PORTAL SISWA)
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#gerbang"
            onClick={(e) => {
              e.preventDefault();
              setShowGuide(false);
            }}
            className="text-base font-extrabold tracking-tight text-[#0B1F3A] whitespace-nowrap shrink-0"
          >
            UJIAN LOCK SMESA
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className={`hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0 ${
                !showGuide ? 'text-[#0B1F3A] font-semibold' : ''
              }`}
            >
              Gerbang Siswa
            </button>
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className={`hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0 ${
                showGuide ? 'text-[#0B1F3A] font-semibold' : ''
              }`}
            >
              Panduan Siswa
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenStaffLogin}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Masuk Pengawas / Admin
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10">
        {showGuide ? (
          <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-8 space-y-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-[#0B1F3A]">Panduan Penggunaan untuk Siswa</h1>
              <p className="text-sm text-slate-600">
                SMK Negeri 1 Jember — Ujian Tertib · Data Terpantau · Integritas Terjaga
              </p>
            </div>
            <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
              <p>
                <strong>1. Persiapan Masuk:</strong> Siapkan Nomor Induk Siswa (NIS) dan Token Ujian yang dibagikan oleh
                pengawas ruang. Satu token hanya berlaku untuk satu peserta dan memiliki masa berlaku terbatas.
              </p>
              <p>
                <strong>2. Validasi & Fullscreen:</strong> Masukkan NIS dan Token pada halaman Gerbang Siswa, lalu tekan{' '}
                <strong>MULAI UJIAN</strong>. Baca tata tertib dan tekan <strong>AKTIFKAN FULLSCREEN</strong> untuk
                membuka halaman soal Google Form.
              </p>
              <p>
                <strong>3. Aturan Ketertiban:</strong> Tetap berada di halaman ujian selama mengerjakan. Keluar dari mode
                layar penuh atau berpindah tab akan tercatat otomatis sebagai pelanggaran (Peringatan 1, Peringatan 2,
                dan Kunci Sesi pada pelanggaran ke-3).
              </p>
              <p>
                <strong>4. Jika Sesi Terkunci:</strong> Angkat tangan dan lapor kepada pengawas ruang. Pengawas akan
                memeriksa log dan menerbitkan <strong>TOKEN BARU</strong> khusus atas nama Anda untuk melanjutkan ujian.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors"
            >
              Kembali ke Gerbang Ujian
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Column: School Institutional Context & Active Schedule */}
            <div className="lg:col-span-7 flex flex-col justify-between bg-[#0B1F3A] text-white rounded-xl p-8 lg:p-10">
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <BrandMark size="lg" />
                  <div>
                    <div className="text-xs font-semibold tracking-wide text-blue-300">
                      SMK NEGERI 1 JEMBER
                    </div>
                    <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-white mt-0.5">
                      UJIAN LOCK SMESA
                    </h1>
                    <p className="text-xs text-blue-200 mt-1">
                      Secure Online Examination · Ujian Tertib · Data Terpantau · Integritas Terjaga
                    </p>
                  </div>
                </div>

                <p className="text-sm text-blue-100 leading-relaxed max-w-xl">
                  Gerbang resmi ujian daring berbasis Google Form dengan validasi token tunggal, aktivasi layar penuh,
                  serta pemantauan aktivitas peserta secara langsung oleh pengawas ruang.
                </p>

                {/* Active Exams List */}
                <div className="pt-4 border-t border-white/15 space-y-3">
                  <h2 className="text-xs font-semibold text-blue-200">
                    Jadwal Ujian Hari Ini
                  </h2>
                  {publicExams.length === 0 ? (
                    <p className="text-sm text-blue-200/80">Belum ada ujian aktif yang dijadwalkan saat ini.</p>
                  ) : (
                    <div className="divide-y divide-white/10">
                      {publicExams.map((ex) => (
                        <div key={ex.id} className="py-3 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{ex.nama_ujian}</div>
                            <div className="text-xs text-blue-200 mt-0.5">
                              {ex.kelas} · {ex.jam_mulai}–{ex.jam_selesai} WIB · {ex.durasi} menit
                            </div>
                          </div>
                          <span
                            className={`text-xs font-semibold shrink-0 ${
                              ex.status === 'AKTIF' ? 'text-emerald-300' : 'text-blue-200'
                            }`}
                          >
                            {ex.status === 'AKTIF' ? 'Dibuka' : 'Terjadwal'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-white/15 text-xs text-blue-200/90 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-300 shrink-0" />
                <span>
                  Pemantauan mencatat event browser (layar penuh, pindah tab, fokus jendela) secara server-side.
                </span>
              </div>
            </div>

            {/* Right Column: Student Gate Form */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-center">
              <div className="space-y-1 mb-6">
                <h2 className="text-xl font-bold text-slate-900">Masuk Ruang Ujian</h2>
                <p className="text-sm text-slate-600">
                  Masukkan NIS dan Token Ujian yang diberikan oleh pengawas.
                </p>
              </div>

              {error && (
                <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium leading-relaxed">
                  {error}
                </div>
              )}

              <form onSubmit={handleValidateToken} className="space-y-4">
                <div>
                  <label htmlFor="student-nis" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nomor Induk Siswa (NIS)
                  </label>
                  <input
                    id="student-nis"
                    type="text"
                    required
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    placeholder="Contoh: 2024001"
                    className="w-full px-4 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label htmlFor="student-token" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Token Ujian
                  </label>
                  <input
                    id="student-token"
                    type="text"
                    required
                    value={tokenCode}
                    onChange={(e) => setTokenCode(e.target.value.toUpperCase())}
                    placeholder="Contoh: SMS-RPL201"
                    className="w-full px-4 py-2.5 text-sm font-mono uppercase tracking-wider border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <span>{submitting ? 'Memvalidasi Token...' : 'MULAI UJIAN'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-100 space-y-1.5 text-xs text-slate-500">
                <p>Data uji coba siap pakai: NIS <code className="font-mono text-slate-700">2024001</code> · Token <code className="font-mono text-slate-700">SMS-RPL201</code></p>
                <p>Token unik diverifikasi di server dan tidak dapat dipakai oleh dua peserta.</p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} SMK Negeri 1 Jember — UJIAN LOCK SMESA</span>
          <span>Ujian Tertib · Data Terpantau · Integritas Terjaga</span>
        </div>
      </footer>
    </div>
  );
}
