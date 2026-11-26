import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Save,
  XCircle,
} from 'lucide-react';
import { ApiError, apiRequest, formatDateTime } from '../lib/api';
import type { SheetSyncConfig } from '../types';

interface GoogleSheetSyncViewProps {
  authToken: string;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

export function GoogleSheetSyncView({ authToken, onNotify }: GoogleSheetSyncViewProps) {
  const [config, setConfig] = useState<SheetSyncConfig | null>(null);
  const [appsScriptCode, setAppsScriptCode] = useState('');
  const [loading, setLoading] = useState(true);

  const [webAppUrl, setWebAppUrl] = useState('');
  const [syncSecret, setSyncSecret] = useState('');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [intervalSec, setIntervalSec] = useState(60);
  const [autoPushOnChange, setAutoPushOnChange] = useState(true);

  const [saving, setSaving] = useState(false);
  const [syncingAction, setSyncingAction] = useState<'push' | 'pull' | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cfgRes, assetsRes] = await Promise.all([
        apiRequest<{ config: SheetSyncConfig }>('/api/admin/sheet-sync', { token: authToken }),
        apiRequest<{ appsScriptCode: string; supabaseSql: string }>('/api/admin/export-assets', {
          token: authToken,
        }),
      ]);
      setConfig(cfgRes.config);
      setWebAppUrl(cfgRes.config.web_app_url);
      setAutoSyncEnabled(cfgRes.config.auto_sync_enabled);
      setIntervalSec(cfgRes.config.auto_sync_interval_sec);
      setAutoPushOnChange(cfgRes.config.auto_push_on_change);
      setAppsScriptCode(assetsRes.appsScriptCode);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal memuat konfigurasi Google Sheet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        web_app_url: webAppUrl,
        auto_sync_enabled: autoSyncEnabled,
        auto_sync_interval_sec: intervalSec,
        auto_push_on_change: autoPushOnChange,
      };
      if (syncSecret.trim()) {
        body.sync_secret = syncSecret.trim();
      }
      const res = await apiRequest<{ config: SheetSyncConfig }>('/api/admin/sheet-sync', {
        method: 'PATCH',
        token: authToken,
        body,
      });
      setConfig(res.config);
      setSyncSecret('');
      onNotify('success', 'Konfigurasi sinkronisasi Google Sheet & Apps Script disimpan.');
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal menyimpan konfigurasi.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSync(direction: 'push' | 'pull') {
    setSyncingAction(direction);
    try {
      const res = await apiRequest<{ ok: boolean; message: string; config: SheetSyncConfig }>(
        `/api/admin/sheet-sync/${direction}`,
        { method: 'POST', token: authToken }
      );
      setConfig(res.config);
      onNotify('success', res.message);
    } catch (err) {
      if (err instanceof ApiError && err.data.config) {
        setConfig(err.data.config as SheetSyncConfig);
      }
      onNotify('danger', err instanceof ApiError ? err.message : 'Sinkronisasi gagal.');
    } finally {
      setSyncingAction(null);
    }
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(appsScriptCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
      onNotify('info', 'Kode Apps Script (Code.gs) berhasil disalin ke clipboard.');
    });
  }

  function handleDownloadCode() {
    const blob = new Blob([appsScriptCode], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Code.gs';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Memuat konfigurasi Google Sheet...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Database Google Sheet & Apps Script</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Sinkronisasi dua arah otomatis antara sistem utama UJIAN LOCK SMESA dan Google Sheets sekolah via Apps
            Script Web App.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={syncingAction !== null || !config?.web_app_url}
            onClick={() => handleSync('pull')}
            className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-blue-700" />
            {syncingAction === 'pull' ? 'Menarik...' : 'Tarik Siswa, Ujian & Akun'}
          </button>
          <button
            type="button"
            disabled={syncingAction !== null || !config?.web_app_url}
            onClick={() => handleSync('push')}
            className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            {syncingAction === 'push' ? 'Mengirim...' : 'Kirim Semua ke Sheet'}
          </button>
        </div>
      </div>

      {/* Config Form + Sync Status */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSaveConfig}
          className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
            <h2 className="text-sm font-bold text-slate-900">Pengaturan Koneksi & Auto-Sync</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Google Apps Script Web App URL
              </label>
              <input
                type="url"
                value={webAppUrl}
                onChange={(e) => setWebAppUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Hanya URL HTTPS resmi <code className="font-mono">script.google.com</code> yang diizinkan demi
                keamanan server.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Sync Secret (Opsional — cocokkan dengan Script Property <code className="font-mono">SYNC_SECRET</code>)
              </label>
              <input
                type="password"
                value={syncSecret}
                onChange={(e) => setSyncSecret(e.target.value)}
                placeholder={config?.has_secret ? '•••••••• (sudah tersimpan, isi untuk mengganti)' : 'Kosongkan jika tidak disetel di Apps Script'}
                className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <label className="flex items-start gap-2.5 p-3.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                  className="mt-0.5 accent-blue-700"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">Aktifkan Sinkronisasi Otomatis</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Menjaga data Akun Staff, Master Siswa, Ujian, dan Sesi selalu terbarui di sistem utama & Sheet.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={autoPushOnChange}
                  onChange={(e) => setAutoPushOnChange(e.target.checked)}
                  className="mt-0.5 accent-blue-700"
                />
                <div>
                  <div className="text-xs font-semibold text-slate-900">Auto-Push Saat Ada Perubahan</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Otomatis mengirim pembaruan ke Google Sheet 2,5 detik setelah mutasi data.
                  </div>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Interval Sinkronisasi Berkala (Pull + Push)
              </label>
              <select
                value={intervalSec}
                onChange={(e) => setIntervalSec(Number(e.target.value))}
                className="w-full sm:w-64 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value={30}>Setiap 30 Detik</option>
                <option value={60}>Setiap 1 Menit (Direkomendasikan)</option>
                <option value={300}>Setiap 5 Menit</option>
                <option value={0}>Hanya saat ada perubahan (tanpa interval)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
            <div className="text-xs text-slate-500">
              Terakhir sinkron:{' '}
              <span className="font-mono text-slate-800">{formatDateTime(config?.last_sync_at)}</span>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#0B1F3A] hover:bg-blue-900 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>

        {/* Sync Status & History */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Riwayat Sinkronisasi</h2>
              <p className="text-xs text-slate-500 mt-0.5">{config?.last_sync_message}</p>
            </div>
            <RefreshCw className={`w-4 h-4 text-slate-400 ${syncingAction ? 'animate-spin text-blue-700' : ''}`} />
          </div>
          {!config || config.history.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Belum ada riwayat sinkronisasi. Tempel URL Web App Apps Script lalu klik <strong>Kirim Semua ke Sheet</strong>.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {config.history.map((item) => (
                <div key={item.id} className="px-5 py-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                      {item.status === 'SUCCESS' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-600" />
                      )}
                      {item.direction === 'PUSH' ? 'Push ke Google Sheet' : 'Pull dari Google Sheet'}
                    </span>
                    <span className="font-mono text-slate-400 tabular-nums">{formatDateTime(item.created_at)}</span>
                  </div>
                  <p className="text-slate-600">{item.message}</p>
                  <div className="text-[11px] text-slate-400">
                    Pemicu: {item.triggered_by} · {item.records_affected} baris
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ready-to-Deploy Apps Script Code.gs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Skrip Google Apps Script (<code className="font-mono text-blue-700">Code.gs</code>)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Otomatis membuat 8 tab lembar kerja (<code className="font-mono">staff_users</code>,{' '}
              <code className="font-mono">students</code>, <code className="font-mono">exams</code>,{' '}
              <code className="font-mono">exam_sessions</code>, <code className="font-mono">tokens</code>,{' '}
              <code className="font-mono">violations</code>, <code className="font-mono">activity_logs</code>,{' '}
              <code className="font-mono">audit_logs</code>)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadCode}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Code.gs
            </button>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3 py-1.5 rounded-lg bg-[#0B1F3A] hover:bg-blue-900 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCode ? 'Tersalin' : 'Salin Kode'}
            </button>
          </div>
        </div>
        <pre className="p-5 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto max-h-80 leading-relaxed">
          {appsScriptCode}
        </pre>
      </div>
    </div>
  );
}
