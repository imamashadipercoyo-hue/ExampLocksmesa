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
import type { DashboardSnapshot, Major, StudentStatus } from '../types';

interface MajorsViewProps {
  snapshot: DashboardSnapshot;
  authToken: string;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

const EMPTY_MAJOR = {
  kode: '',
  nama_jurusan: '',
  status: 'AKTIF' as StudentStatus,
};

export function MajorsView({ snapshot, authToken, onNotify }: MajorsViewProps) {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_MAJOR);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const studentCountByMajor = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of snapshot.students) {
      const key = s.jurusan.trim().toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [snapshot.students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (snapshot.majors || []).filter((m) => {
      if (!q) return true;
      return (
        m.kode.toLowerCase().includes(q) ||
        m.nama_jurusan.toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q)
      );
    });
  }, [snapshot.majors, search]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_MAJOR);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(major: Major) {
    setEditingId(major.id);
    setForm({
      kode: major.kode,
      nama_jurusan: major.nama_jurusan,
      status: major.status,
    });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/majors/${editingId}`, {
          method: 'PATCH',
          token: authToken,
          body: form,
        });
        onNotify('success', `Jurusan ${form.kode} berhasil diperbarui.`);
      } else {
        await apiRequest('/api/majors', {
          method: 'POST',
          token: authToken,
          body: form,
        });
        onNotify('success', `Jurusan ${form.kode} — ${form.nama_jurusan} berhasil ditambahkan.`);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Gagal menyimpan jurusan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(major: Major) {
    try {
      await apiRequest(`/api/majors/${major.id}`, {
        method: 'DELETE',
        token: authToken,
      });
      onNotify('info', `Jurusan ${major.kode} dihapus.`);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal menghapus jurusan.');
    }
  }

  async function handleDownloadTemplate() {
    await downloadExcelWorkbook('Template_Master_Jurusan_SMESA.xlsx', [
      {
        name: 'Master_Jurusan',
        headers: ['Kode', 'Nama Jurusan', 'Status'],
        rows: [
          ['RPL', 'Rekayasa Perangkat Lunak', 'AKTIF'],
          ['TKJ', 'Teknik Komputer & Jaringan', 'AKTIF'],
          ['AKL', 'Akuntansi & Keuangan Lembaga', 'AKTIF'],
        ],
        widths: [14, 40, 12],
      },
    ]);
    onNotify('info', 'Template Excel Master Jurusan berhasil diunduh.');
  }

  async function handleExportExcel() {
    await downloadExcelWorkbook(
      `Master_Jurusan_SMESA_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        {
          name: 'Master_Jurusan',
          headers: ['Kode', 'Nama Jurusan', 'Jumlah Siswa', 'Status'],
          rows: filtered.map((m) => [
            m.kode,
            m.nama_jurusan,
            studentCountByMajor.get(m.nama_jurusan.trim().toLowerCase()) || 0,
            m.status,
          ]),
          widths: [14, 40, 16, 12],
        },
      ]
    );
  }

  async function handleExcelUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      onNotify('danger', 'Ukuran file maksimal 4 MB.');
      e.target.value = '';
      return;
    }

    setImporting(true);
    try {
      const rawRows = await readSpreadsheetRows(file);

      const parsed: Array<{ kode: string; nama_jurusan: string; status: string }> = [];
      for (const normalized of rawRows.slice(0, 200)) {
        const kode = normalized.kode || normalized.kode_jurusan || '';
        const namaJurusan =
          normalized.nama_jurusan || normalized.jurusan || normalized.kompetensi_keahlian || '';
        const status = normalized.status || 'AKTIF';
        if (!kode || !namaJurusan) continue;
        parsed.push({ kode: kode.toUpperCase(), nama_jurusan: namaJurusan, status });
      }

      if (parsed.length === 0) {
        onNotify('warning', 'Tidak ditemukan kolom Kode dan Nama Jurusan pada file Excel.');
        return;
      }

      const res = await apiRequest<{ inserted: number; updated: number }>('/api/majors/bulk', {
        method: 'POST',
        token: authToken,
        body: { majors: parsed },
      });
      onNotify(
        'success',
        `Impor Master Jurusan berhasil: ${res.inserted} baru ditambahkan, ${res.updated} diperbarui.`
      );
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal membaca file Excel Jurusan.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Master Input Jurusan</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Daftar kompetensi keahlian SMK Negeri 1 Jember sebagai acuan Master Input Siswa & sinkron otomatis ke tab{' '}
            <code className="font-mono text-blue-800">majors</code> Google Sheet.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={handleExcelUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Template Excel
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            {importing ? 'Mengimpor...' : 'Impor Excel'}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Tambah Jurusan
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          {filtered.length} jurusan terdaftar
        </span>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode atau nama jurusan..."
            className="pl-9 pr-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Belum ada data jurusan ditemukan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Nama Kompetensi Keahlian / Jurusan</th>
                  <th className="py-3 px-4 text-right">Siswa Terdaftar</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((m) => {
                  const count = studentCountByMajor.get(m.nama_jurusan.trim().toLowerCase()) || 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-[#0B1F3A]">{m.kode}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{m.nama_jurusan}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {count} siswa
                      </td>
                      <td className="py-3 px-4">
                        {m.status === 'AKTIF' ? (
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
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(m)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            aria-label={`Edit jurusan ${m.kode}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m)}
                            className="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50"
                            aria-label={`Hapus jurusan ${m.kode}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold">
                {editingId ? 'Edit Data Jurusan' : 'Tambah Jurusan Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-blue-200 hover:text-white"
                aria-label="Tutup modal jurusan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode Singkatan Jurusan
                </label>
                <input
                  type="text"
                  required
                  value={form.kode}
                  onChange={(e) => setForm({ ...form, kode: e.target.value.toUpperCase() })}
                  placeholder="Contoh: RPL, TKJ, AKL, DKV"
                  className="w-full px-3.5 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap Jurusan
                </label>
                <input
                  type="text"
                  required
                  value={form.nama_jurusan}
                  onChange={(e) => setForm({ ...form, nama_jurusan: e.target.value })}
                  placeholder="Contoh: Rekayasa Perangkat Lunak"
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
                  {saving ? 'Menyimpan...' : 'Simpan Jurusan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
