import { useEffect, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface DeploymentDocsViewProps {
  authToken: string;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

type DocTab = 'guides' | 'apps-script' | 'supabase-sql' | 'architecture';

export function DeploymentDocsView({ authToken, onNotify }: DeploymentDocsViewProps) {
  const [tab, setTab] = useState<DocTab>('guides');
  const [appsScriptCode, setAppsScriptCode] = useState('');
  const [supabaseSql, setSupabaseSql] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ appsScriptCode: string; supabaseSql: string }>('/api/admin/export-assets', {
      token: authToken,
    })
      .then((res) => {
        setAppsScriptCode(res.appsScriptCode);
        setSupabaseSql(res.supabaseSql);
      })
      .catch(() => {});
  }, [authToken]);

  function copyText(key: string, text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
      onNotify('info', `${label} disalin ke clipboard.`);
    });
  }

  function downloadFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Dokumentasi, Skrip & Panduan Deploy</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Seluruh panduan operasional Pengawas & Siswa, integrasi Google Form, Apps Script, SQL Supabase + RLS + RPC,
          serta panduan deployment.
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto w-fit">
        {(
          [
            { id: 'guides', label: 'Panduan Lengkap' },
            { id: 'apps-script', label: 'Google Apps Script (Code.gs)' },
            { id: 'supabase-sql', label: 'SQL Supabase + RLS + RPC' },
            { id: 'architecture', label: 'Struktur & Env' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              tab === item.id ? 'bg-white text-[#0B1F3A] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'guides' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-base font-bold text-[#0B1F3A]">01. Menghubungkan Google Form</h2>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-700 leading-relaxed">
              <li>Buka Google Form soal ujian di akun sekolah, klik tombol <strong>Kirim (Send)</strong>.</li>
              <li>Pilih tab tautan atau embed HTML, lalu salin URL form (<code className="font-mono">https://docs.google.com/forms/d/e/.../viewform</code>).</li>
              <li>Nonaktifkan opsi <em>Batasi 1 tanggapan</em> jika komputer lab memakai mode tamu, atau aktifkan login akun belajar.id sesuai kebijakan sekolah.</li>
              <li>Masuk ke menu <strong>Jadwal Ujian & Google Form</strong>, tempel URL tersebut, lalu ubah status ujian menjadi <strong>AKTIF</strong>.</li>
            </ol>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-base font-bold text-[#0B1F3A]">02. Menghubungkan Google Sheet & Apps Script</h2>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-700 leading-relaxed">
              <li>Buat Google Sheet baru bernama <code className="font-mono">DB_UJIAN_LOCK_SMESA</code>.</li>
              <li>Buka <strong>Ekstensi → Apps Script</strong>, tempel seluruh isi <code className="font-mono">Code.gs</code>, lalu jalankan fungsi <code className="font-mono">setupSheets()</code> sekali untuk membuat 9 tab otomatis (termasuk <code className="font-mono">staff_users</code>, <code className="font-mono">majors</code>, dan <code className="font-mono">students</code>).</li>
              <li>Klik <strong>Deploy → New deployment → Web app</strong> (Execute as: <em>Me</em>, Who has access: <em>Anyone</em>).</li>
              <li>Tempel URL Web App ke menu <strong>Google Sheet & Apps Script</strong>, aktifkan <strong>Sinkronisasi Otomatis</strong>, lalu klik <strong>Kirim Semua ke Sheet</strong>.</li>
            </ol>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-base font-bold text-[#0B1F3A]">03. Panduan Penggunaan oleh Pengawas</h2>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-700 leading-relaxed">
              <li>Masuk menggunakan akun <strong>Pengawas</strong> untuk membuka Dashboard Pengawas Ruang.</li>
              <li>Pastikan jadwal ujian berstatus <strong>AKTIF</strong> dan terbitkan token ujian di menu <strong>Manajemen Token</strong>.</li>
              <li>Pantau tabel <strong>Monitoring Peserta Realtime</strong> (status berubah otomatis dari Aktif → Warning → Terkunci tanpa refresh).</li>
              <li>Bila siswa terkunci, klik tombol <strong>Buka Kunci</strong> pada baris siswa, tinjau riwayat pelanggaran, lalu klik <strong>BUKA KUNCI</strong> untuk menerbitkan <strong>TOKEN BARU</strong> khusus siswa tersebut.</li>
            </ol>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-base font-bold text-[#0B1F3A]">04. Panduan Instalasi & Deploy Vercel / Cloud Run</h2>
            <ol className="list-decimal pl-5 space-y-2 text-xs text-slate-700 leading-relaxed">
              <li>Jalankan <code className="font-mono">npm install</code> lalu <code className="font-mono">npm run dev</code> untuk menjalankan server Express + WebSocket + Vite pada port 3000.</li>
              <li>Untuk produksi penuh dengan WebSocket realtime & Google Sheet Sync, deploy sebagai Node.js full-stack (<code className="font-mono">npm run build && npm start</code>) di Cloud Run / VPS sekolah.</li>
              <li>Untuk deployment frontend di <strong>Vercel</strong> bersama <strong>Supabase Realtime</strong>, impor repositori ke Vercel, isi <code className="font-mono">VITE_SUPABASE_URL</code> dan <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> (jangan pernah taruh <code className="font-mono">service_role</code> di frontend!), lalu jalankan <code className="font-mono">supabase/schema.sql</code> di SQL Editor Supabase.</li>
            </ol>
          </section>
        </div>
      )}

      {tab === 'apps-script' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-900 font-mono">/google-apps-script/Code.gs</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadFile('Code.gs', appsScriptCode)}
                className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh
              </button>
              <button
                type="button"
                onClick={() => copyText('gas', appsScriptCode, 'Google Apps Script')}
                className="px-3 py-1.5 rounded-md bg-[#0B1F3A] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {copiedKey === 'gas' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'gas' ? 'Tersalin' : 'Salin'}
              </button>
            </div>
          </div>
          <pre className="p-5 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto max-h-[520px] leading-relaxed">
            {appsScriptCode}
          </pre>
        </div>
      )}

      {tab === 'supabase-sql' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-900 font-mono">
              /supabase/schema.sql (Tabel, FK, RLS, RPC, Realtime)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadFile('smesa-supabase-schema.sql', supabaseSql)}
                className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh SQL
              </button>
              <button
                type="button"
                onClick={() => copyText('sql', supabaseSql, 'SQL Supabase + RLS + RPC')}
                className="px-3 py-1.5 rounded-md bg-[#0B1F3A] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {copiedKey === 'sql' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'sql' ? 'Tersalin' : 'Salin SQL'}
              </button>
            </div>
          </div>
          <pre className="p-5 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto max-h-[520px] leading-relaxed">
            {supabaseSql}
          </pre>
        </div>
      )}

      {tab === 'architecture' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-bold text-[#0B1F3A]">Struktur Folder Proyek</h2>
            <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">{`/
├── server.ts                      # Express API + WebSocket Realtime + Vite
├── server/
│   ├── store.ts                   # Persistent store, scrypt auth, token & violation engine
│   └── googleSheetSync.ts         # Auto-Sync dua arah Google Sheets + SSRF guard
├── google-apps-script/
│   └── Code.gs                    # Google Apps Script Web App (7 tab otomatis)
├── supabase/
│   └── schema.sql                 # DDL, FK, RLS Policy, RPC & Realtime Publication
├── src/
│   ├── types.ts                   # Definisi tipe data TypeScript
│   ├── lib/
│   │   ├── api.ts                 # HTTP client (Bearer token in-memory only)
│   │   └── useRealtime.ts         # WebSocket hook auto-reconnect
│   └── components/
│       ├── StudentPortal.tsx      # Gerbang Siswa, Fullscreen API, Google Form, Modals
│       ├── WorkspaceLayout.tsx    # Layout terpisah Dashboard Admin vs Pengawas
│       ├── DashboardOverview.tsx  # 7 Kartu statistik + Monitoring + Aktivitas
│       ├── MonitoringView.tsx     # Tabel monitoring peserta realtime
│       ├── SessionDetailModal.tsx # Detail peserta + Buka Kunci & Token Baru
│       ├── ViolationsView.tsx     # Log pelanggaran browser langsung
│       ├── TokensView.tsx         # Manajemen token unik & masa berlaku
│       ├── ExamsView.tsx          # Jadwal ujian & URL Google Form
│       ├── StudentsView.tsx       # Data siswa & Master Input Siswa (Admin)
│       ├── GoogleSheetSyncView.tsx# Konfigurasi & sinkronisasi Google Sheet (Admin)
│       ├── StaffManagementView.tsx# Manajemen akun pengawas & admin (Admin)
│       ├── AuditLogView.tsx       # Audit log lengkap (Admin)
│       └── DeploymentDocsView.tsx # Dokumentasi, SQL & panduan deploy (Admin)`}</pre>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-sm font-bold text-[#0B1F3A]">Konfigurasi Environment Variables (.env)</h2>
            <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">{`APP_URL="https://ujian-smesa.sekolah.sch.id"

# Opsional: kata sandi server-side (jika kosong, form aktivasi pertama muncul)
ADMIN_PASSWORD="kata_sandi_admin_kuat"
PENGAWAS_PASSWORD="kata_sandi_pengawas_kuat"

# Koneksi Google Apps Script Web App
GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/.../exec"
GOOGLE_SHEET_SYNC_SECRET="rahasia_sinkronisasi_sheet"

# Opsional untuk deploy Vercel + Supabase Realtime
VITE_SUPABASE_URL="https://xxxx.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGci..."`}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
