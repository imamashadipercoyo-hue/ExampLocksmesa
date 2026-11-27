import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
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
import { downloadExcelWorkbook, readSpreadsheetRows } from '../lib/excel';
import type { DashboardSnapshot, StaffUser, Student, StudentStatus } from '../types';

interface StudentsViewProps {
  snapshot: DashboardSnapshot;
  user: StaffUser;
  authToken: string;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
  onNavigate?: (tab: string) => void;
}

interface ParsedStudentRow {
  nis: string;
  nama: string;
  kelas: string;
  jurusan: string;
  status: 'AKTIF' | 'NONAKTIF';
}

export function StudentsView({ snapshot, user, authToken, onNotify, onNavigate }: StudentsViewProps) {
  const isAdmin = user.role === 'ADMIN';
  const activeMajors = useMemo(
    () => (snapshot.majors || []).filter((m) => m.status === 'AKTIF'),
    [snapshot.majors]
  );

  const defaultMajorName = activeMajors[0]?.nama_jurusan || 'Rekayasa Perangkat Lunak';

  const [search, setSearch] = useState('');
  const [kelasFilter, setKelasFilter] = useState('ALL');
  const [jurusanFilter, setJurusanFilter] = useState('ALL');

  // Single add/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nis: '',
    nama: '',
    kelas: 'XII RPL 1',
    jurusan: defaultMajorName,
    status: 'AKTIF' as StudentStatus,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Excel & Bulk Import Modal
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importMode, setImportMode] = useState<'excel' | 'paste'>('excel');
  const [bulkText, setBulkText] = useState('');
  const [excelPreview, setExcelPreview] = useState<ParsedStudentRow[]>([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const classes = useMemo(() => {
    const set = new Set(snapshot.students.map((s) => s.kelas));
    return Array.from(set).sort();
  }, [snapshot.students]);

  const majorOptions = useMemo(() => {
    const set = new Set<string>(activeMajors.map((m) => m.nama_jurusan));
    for (const s of snapshot.students) {
      if (s.jurusan) set.add(s.jurusan);
    }
    return Array.from(set).sort();
  }, [activeMajors, snapshot.students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.students.filter((s) => {
      if (kelasFilter !== 'ALL' && s.kelas !== kelasFilter) return false;
      if (jurusanFilter !== 'ALL' && s.jurusan !== jurusanFilter) return false;
      if (!q) return true;
      return (
        s.nis.toLowerCase().includes(q) ||
        s.nama.toLowerCase().includes(q) ||
        s.kelas.toLowerCase().includes(q) ||
        s.jurusan.toLowerCase().includes(q)
      );
    });
  }, [snapshot.students, search, kelasFilter, jurusanFilter]);

  function openAdd() {
    setEditingId(null);
    setForm({
      nis: '',
      nama: '',
      kelas: 'XII RPL 1',
      jurusan: activeMajors[0]?.nama_jurusan || 'Rekayasa Perangkat Lunak',
      status: 'AKTIF',
    });
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

  function resolveMajorName(raw: string): string {
    const clean = raw.trim();
    if (!clean) return activeMajors[0]?.nama_jurusan || '-';
    // Match by kode (e.g. RPL) or nama_jurusan (case-insensitive)
    const matched = (snapshot.majors || []).find(
      (m) =>
        m.kode.toLowerCase() === clean.toLowerCase() ||
        m.nama_jurusan.toLowerCase() === clean.toLowerCase()
    );
    return matched ? matched.nama_jurusan : clean;
  }

  async function handleExcelFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onNotify('danger', 'Ukuran file Excel maksimal 5 MB.');
      e.target.value = '';
      return;
    }

    try {
      const rawRows = await readSpreadsheetRows(file);

      const parsed: ParsedStudentRow[] = [];
      for (const norm of rawRows.slice(0, 2000)) {
        const nis = norm.nis || norm.no_induk || norm.nisn || '';
        const nama = norm.nama || norm.nama_lengkap || norm.nama_siswa || '';
        const kelas = norm.kelas || norm.rombel || 'XII';
        const jurusanRaw = norm.jurusan || norm.kompetensi_keahlian || norm.prodi || '';
        const statusRaw = (norm.status || 'AKTIF').toUpperCase();
        if (!nis || !nama) continue;

        parsed.push({
          nis,
          nama,
          kelas,
          jurusan: resolveMajorName(jurusanRaw),
          status: statusRaw === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF',
        });
      }

      if (parsed.length === 0) {
        onNotify(
          'warning',
          'Tidak ditemukan baris valid. Pastikan header kolom berisi: NIS, Nama, Kelas, Jurusan, Status.'
        );
        setExcelPreview([]);
        setExcelFileName('');
      } else {
        setExcelPreview(parsed);
        setExcelFileName(file.name);
        onNotify('info', `Terbaca ${parsed.length} data siswa dari "${file.name}". Periksa pratinjau lalu klik Impor.`);
      }
    } catch {
      onNotify('danger', 'File tidak dapat dibaca. Pastikan formatnya .xlsx atau .csv yang valid.');
    } finally {
      e.target.value = '';
    }
  }

  async function handleConfirmImport(e: FormEvent) {
    e.preventDefault();
    let payload: ParsedStudentRow[] = [];

    if (importMode === 'excel') {
      payload = excelPreview;
    } else {
      const lines = bulkText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      for (const line of lines) {
        const cols = line.includes('\t')
          ? line.split('\t')
          : line.includes(';')
          ? line.split(';')
          : line.split(',');
        const [nis, nama, kelas, jurusan, status] = cols.map((c) => c.trim().replace(/^"|"$/g, ''));
        if (!nis || !nama || nis.toLowerCase() === 'nis') continue;
        payload.push({
          nis,
          nama,
          kelas: kelas || 'XII RPL 1',
          jurusan: resolveMajorName(jurusan || ''),
          status: (status || 'AKTIF').toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF',
        });
      }
    }

    if (payload.length === 0) {
      onNotify('warning', 'Belum ada data siswa yang siap diimpor.');
      return;
    }

    setBulkImporting(true);
    try {
      const res = await apiRequest<{ inserted: number; updated: number }>('/api/students/bulk', {
        method: 'POST',
        token: authToken,
        body: { students: payload },
      });
      onNotify(
        'success',
        `Impor Master Siswa berhasil: ${res.inserted} siswa baru ditambahkan, ${res.updated} diperbarui.`
      );
      setBulkText('');
      setExcelPreview([]);
      setExcelFileName('');
      setBulkOpen(false);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal mengimpor data siswa.');
    } finally {
      setBulkImporting(false);
    }
  }

  async function handleDownloadExcelTemplate() {
    const sampleMajor1 = activeMajors[0]?.nama_jurusan || 'Rekayasa Perangkat Lunak';
    const sampleMajor2 = activeMajors[1]?.nama_jurusan || 'Teknik Komputer & Jaringan';
    const sheets = [
      {
        name: 'Master_Siswa',
        headers: ['NIS', 'Nama', 'Kelas', 'Jurusan', 'Status'],
        rows: [
          ['2024101', 'Hendra Wijaya', 'XII RPL 1', sampleMajor1, 'AKTIF'],
          ['2024102', 'Indah Permata Sari', 'XII TKJ 1', sampleMajor2, 'AKTIF'],
        ],
        widths: [16, 28, 16, 34, 12],
      },
    ];

    if ((snapshot.majors || []).length > 0) {
      sheets.push({
        name: 'Referensi_Jurusan',
        headers: ['Kode Jurusan', 'Nama Jurusan', 'Status'],
        rows: snapshot.majors.map((m) => [m.kode, m.nama_jurusan, m.status]),
        widths: [16, 38, 12],
      });
    }

    await downloadExcelWorkbook('Template_Master_Siswa_SMESA.xlsx', sheets);
    onNotify('info', 'Template Excel Master Siswa (.xlsx) berhasil diunduh.');
  }

  async function handleExportExcel() {
    await downloadExcelWorkbook(
      `Master_Siswa_SMESA_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        {
          name: 'Master_Siswa',
          headers: ['NIS', 'Nama', 'Kelas', 'Jurusan', 'Status'],
          rows: filtered.map((s) => [s.nis, s.nama, s.kelas, s.jurusan, s.status]),
          widths: [16, 28, 16, 34, 12],
        },
      ]
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">
            {isAdmin ? 'Master Input Siswa (Excel & Manual)' : 'Data Siswa Peserta Ujian'}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {isAdmin
              ? 'Kelola data induk siswa satuan, unggah file Excel (.xlsx/.csv), unduh template Excel, atau sinkron otomatis ke Google Sheet.'
              : 'Daftar peserta terdaftar beserta NIS, kelas, jurusan, dan status keaktifan.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel (.xlsx)
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={handleDownloadExcelTemplate}
                className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                Template Excel
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportMode('excel');
                  setBulkOpen(true);
                }}
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                Impor Excel / Massal
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
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

          <select
            value={jurusanFilter}
            onChange={(e) => setJurusanFilter(e.target.value)}
            aria-label="Filter jurusan"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="ALL">Semua Jurusan</option>
            {majorOptions.map((j) => (
              <option key={j} value={j}>
                {j}
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
            className="pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Data siswa tidak ditemukan untuk filter saat ini.
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

      {/* Single Add/Edit Modal (Uses Master Jurusan dropdown) */}
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Jurusan (Master Jurusan)
                  </label>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpen(false);
                        onNavigate('majors');
                      }}
                      className="text-[11px] font-semibold text-blue-700 hover:underline"
                    >
                      Kelola Jurusan →
                    </button>
                  )}
                </div>
                <select
                  required
                  value={form.jurusan}
                  onChange={(e) => setForm({ ...form, jurusan: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {activeMajors.map((m) => (
                    <option key={m.id} value={m.nama_jurusan}>
                      {m.kode} — {m.nama_jurusan}
                    </option>
                  ))}
                  {form.jurusan &&
                    !activeMajors.some((m) => m.nama_jurusan === form.jurusan) && (
                      <option value={form.jurusan}>{form.jurusan}</option>
                    )}
                </select>
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

      {/* Excel & Bulk Master Input Modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-bold">Impor Master Input Siswa dari Excel</h2>
                <p className="text-xs text-blue-200 mt-0.5">
                  Mendukung unggah langsung file .xlsx / .csv atau tempel data dari Excel / Google Sheets
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

            <form onSubmit={handleConfirmImport} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Mode Switcher */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setImportMode('excel')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      importMode === 'excel'
                        ? 'bg-white text-[#0B1F3A] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Upload File Excel (.xlsx / .csv)
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('paste')}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      importMode === 'paste'
                        ? 'bg-white text-[#0B1F3A] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Copy-Paste Tabel / CSV
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadExcelTemplate}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  Unduh Template Excel (.xlsx)
                </button>
              </div>

              {importMode === 'excel' ? (
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={handleExcelFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-blue-600 rounded-xl p-7 text-center cursor-pointer transition-colors bg-slate-50/70"
                  >
                    <FileSpreadsheet className="w-9 h-9 text-emerald-700 mx-auto mb-2.5" />
                    <div className="text-sm font-bold text-slate-900">
                      {excelFileName ? `File dipilih: ${excelFileName}` : 'Klik untuk memilih file Excel (.xlsx atau .csv)'}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Kolom otomatis dikenali: <strong>NIS</strong>, <strong>Nama</strong>, <strong>Kelas</strong>,{' '}
                      <strong>Jurusan</strong> (kode seperti <code className="font-mono">RPL</code> otomatis dicocokkan
                      ke Master Jurusan), dan <strong>Status</strong>.
                    </p>
                  </div>

                  {excelPreview.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">
                          Pratinjau Data Siap Impor ({excelPreview.length} siswa)
                        </span>
                        <span className="text-slate-500">
                          NIS yang sudah ada otomatis diperbarui (upsert)
                        </span>
                      </div>
                      <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0">
                              <th className="py-2 px-3">NIS</th>
                              <th className="py-2 px-3">Nama</th>
                              <th className="py-2 px-3">Kelas</th>
                              <th className="py-2 px-3">Jurusan</th>
                              <th className="py-2 px-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {excelPreview.slice(0, 50).map((row, idx) => (
                              <tr key={`${row.nis}-${idx}`}>
                                <td className="py-2 px-3 font-mono font-semibold text-slate-900">{row.nis}</td>
                                <td className="py-2 px-3 text-slate-900">{row.nama}</td>
                                <td className="py-2 px-3 text-slate-700">{row.kelas}</td>
                                <td className="py-2 px-3 text-slate-600">{row.jurusan}</td>
                                <td className="py-2 px-3 font-medium text-emerald-700">{row.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {excelPreview.length > 50 && (
                        <p className="text-[11px] text-slate-500">
                          Menampilkan 50 baris pertama dari total {excelPreview.length} siswa yang akan diimpor.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">Format tiap baris (pisahkan dengan koma atau Tab dari Excel):</p>
                    <code className="block font-mono text-blue-800">
                      NIS, Nama Lengkap, Kelas, Jurusan, Status
                    </code>
                    <code className="block font-mono text-slate-500">
                      2024101, Hendra Wijaya, XII RPL 1, RPL, AKTIF
                    </code>
                  </div>
                  <textarea
                    rows={8}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={'2024101, Hendra Wijaya, XII RPL 1, RPL, AKTIF\n2024102, Indah Permata, XII TKJ 1, TKJ, AKTIF'}
                    className="w-full p-3.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBulkOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    bulkImporting ||
                    (importMode === 'excel' ? excelPreview.length === 0 : !bulkText.trim())
                  }
                  className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {bulkImporting
                    ? 'Mengimpor...'
                    : importMode === 'excel'
                    ? `Impor ${excelPreview.length} Siswa ke Master Data`
                    : 'Proses Impor Siswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
