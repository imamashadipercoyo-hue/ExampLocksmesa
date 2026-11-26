import { useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import type { DashboardSnapshot, StaffUser, Student, StudentStatus } from '../types';

interface StudentsViewProps {
  snapshot: DashboardSnapshot;
  user: StaffUser;
  authToken: string;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
  onNavigate?: (tab: string) => void;
}

const EMPTY_STUDENT = {
  nis: '',
  nama: '',
  kelas: 'XII RPL 1',
  jurusan: 'Rekayasa Perangkat Lunak',
  status: 'AKTIF' as StudentStatus,
};

export function StudentsView({ snapshot, user, authToken, onNotify, onNavigate }: StudentsViewProps) {
  const isAdmin = user.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [kelasFilter, setKelasFilter] = useState('ALL');

  // Single add/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_STUDENT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Bulk Master Input modal (CSV / Paste from Google Sheets / Excel)
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);

  const classes = useMemo(() => {
    const set = new Set(snapshot.students.map((s) => s.kelas));
    return Array.from(set).sort();
  }, [snapshot.students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.students.filter((s) => {
      if (kelasFilter !== 'ALL' && s.kelas !== kelasFilter) return false;
      if (!q) return true;
      return (
        s.nis.toLowerCase().includes(q) ||
        s.nama.toLowerCase().includes(q) ||
        s.kelas.toLowerCase().includes(q) ||
        s.jurusan.toLowerCase().includes(q)
      );
    });
  }, [snapshot.students, search, kelasFilter]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_STUDENT);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(student: Student) {
    setEditingId(student.id);
    setForm({
      nis: student.nis,
      nama: student.nama,
      kelas: student.kelas,
      jurusan: student.jurusan,
      status: student.status,
    });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSaveStudent(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/students/${editingId}`, {
          method: 'PATCH',
          token: authToken,
          body: form,
        });
        onNotify('success', `Data siswa ${form.nama} diperbarui.`);
      } else {
        await apiRequest('/api/students', {
          method: 'POST',
          token: authToken,
          body: form,
        });
        onNotify('success', `Siswa ${form.nama} (${form.nis}) berhasil ditambahkan ke Master Siswa.`);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal menyimpan data siswa.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(student: Student) {
    try {
      await apiRequest(`/api/students/${student.id}`, {
        method: 'DELETE',
        token: authToken,
      });
      onNotify('info', `Siswa ${student.nama} (${student.nis}) dihapus.`);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal menghapus siswa.');
    }
  }

  async function handleBulkImport(e: FormEvent) {
    e.preventDefault();
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: Array<{ nis: string; nama: string; kelas: string; jurusan: string; status: string }> = [];
    for (const line of lines) {
      const cols = line.includes('\t')
        ? line.split('\t')
        : line.includes(';')
        ? line.split(';')
        : line.split(',');
      const [nis, nama, kelas, jurusan, status] = cols.map((c) => c.trim().replace(/^"|"$/g, ''));
      if (!nis || !nama || nis.toLowerCase() === 'nis') continue;
      parsed.push({
        nis,
        nama,
        kelas: kelas || 'XII RPL 1',
        jurusan: jurusan || '-',
        status: status || 'AKTIF',
      });
    }

    if (parsed.length === 0) {
      onNotify('warning', 'Format tidak dikenali. Gunakan kolom: NIS, Nama, Kelas, Jurusan, Status.');
      return;
    }

    setBulkImporting(true);
    try {
      const res = await apiRequest<{ inserted: number; updated: number }>('/api/students/bulk', {
        method: 'POST',
        token: authToken,
        body: { students: parsed },
      });
      onNotify(
        'success',
        `Impor Master Siswa berhasil: ${res.inserted} siswa baru ditambahkan, ${res.updated} diperbarui.`
      );
      setBulkText('');
      setBulkOpen(false);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal mengimpor data siswa.');
    } finally {
      setBulkImporting(false);
    }
  }

  function handleExportCsv() {
    const header = 'NIS,Nama,Kelas,Jurusan,Status';
    const rows = filtered.map(
      (s) => `"${s.nis}","${s.nama.replace(/"/g, '""')}","${s.kelas}","${s.jurusan}","${s.status}"`
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `master-siswa-smesa-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">
            {isAdmin ? 'Master Input Siswa' : 'Data Siswa Peserta Ujian'}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {isAdmin
              ? 'Kelola data induk siswa satuan, impor massal dari Excel/CSV, atau sinkronisasi otomatis dengan Google Sheet.'
              : 'Daftar peserta terdaftar beserta NIS, kelas, jurusan, dan status keaktifan.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          {isAdmin && (
            <>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('sheet-sync')}
                  className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  Sinkron Google Sheet
                </button>
              )}
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                Impor Massal
              </button>
              <button
                type="button"
                onClick={openAdd}
                className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah Siswa
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <select
            value={kelasFilter}
            onChange={(e) => setKelasFilter(e.target.value)}
            aria-label="Filter kelas"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Semua Kelas ({snapshot.students.length})</option>
            {classes.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 font-mono tabular-nums">{filtered.length} siswa</span>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari NIS, nama, kelas, jurusan..."
            className="pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Data siswa tidak ditemukan untuk kata kunci ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">NIS</th>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Jurusan</th>
                  <th className="py-3 px-4">Status</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">{s.nis}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{s.nama}</td>
                    <td className="py-3 px-4 text-slate-700">{s.kelas}</td>
                    <td className="py-3 px-4 text-slate-600">{s.jurusan}</td>
                    <td className="py-3 px-4">
                      {s.status === 'AKTIF' ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500">
                          <XCircle className="w-3.5 h-3.5" />
                          Nonaktif
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            aria-label={`Edit ${s.nama}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(s)}
                            className="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50"
                            aria-label={`Hapus ${s.nama}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold">
                {editingId ? 'Edit Data Siswa' : 'Tambah Siswa ke Master Data'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-blue-200 hover:text-white"
                aria-label="Tutup modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveStudent} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">NIS</label>
                <input
                  type="text"
                  required
                  value={form.nis}
                  onChange={(e) => setForm({ ...form, nis: e.target.value })}
                  placeholder="Contoh: 2024009"
                  className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={form.nama}
                  onChange={(e) => setForm({ ...form, nama: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                  <input
                    type="text"
                    required
                    value={form.kelas}
                    onChange={(e) => setForm({ ...form, kelas: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="AKTIF">AKTIF</option>
                    <option value="NONAKTIF">NONAKTIF</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jurusan</label>
                <input
                  type="text"
                  required
                  value={form.jurusan}
                  onChange={(e) => setForm({ ...form, jurusan: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Master Input Modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden">
            <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">Impor Massal Master Input Siswa</h2>
                <p className="text-xs text-blue-200 mt-0.5">
                  Tempel data langsung dari Google Sheets, Excel (Tab), atau CSV
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                className="p-1 text-blue-200 hover:text-white"
                aria-label="Tutup modal impor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleBulkImport} className="p-6 space-y-4">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">Format tiap baris (pisahkan dengan koma atau Tab):</p>
                <code className="block font-mono text-blue-800">
                  NIS, Nama Lengkap, Kelas, Jurusan, Status
                </code>
                <code className="block font-mono text-slate-500">
                  2024010, Hendra Wijaya, XII RPL 1, Rekayasa Perangkat Lunak, AKTIF
                </code>
                <p>Jika NIS sudah ada, data siswa otomatis diperbarui (upsert) dan disinkronkan ke Google Sheet.</p>
              </div>

              <textarea
                rows={8}
                required
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'2024010, Hendra Wijaya, XII RPL 1, Rekayasa Perangkat Lunak, AKTIF\n2024011, Indah Permata, XII TKJ 1, Teknik Komputer & Jaringan, AKTIF'}
                className="w-full p-3.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBulkOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={bulkImporting}
                  className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {bulkImporting ? 'Mengimpor...' : 'Proses Impor Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
