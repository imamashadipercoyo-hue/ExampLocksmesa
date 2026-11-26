import { useState, type FormEvent } from 'react';
import { ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import type { DashboardSnapshot, Exam, ExamStatus, StaffUser } from '../types';
import { ExamStatusText } from './StatusIndicator';

interface ExamsViewProps {
  snapshot: DashboardSnapshot;
  user: StaffUser;
  authToken: string;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

const EMPTY_FORM = {
  nama_ujian: '',
  mata_pelajaran: '',
  kelas: 'XII RPL 1',
  tanggal: new Date().toISOString().slice(0, 10),
  jam_mulai: '07:30',
  jam_selesai: '09:30',
  durasi: 90,
  google_form_url: '',
  status: 'AKTIF' as ExamStatus,
};

export function ExamsView({ snapshot, user, authToken, onNotify }: ExamsViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function openEdit(exam: Exam) {
    setEditingId(exam.id);
    setForm({
      nama_ujian: exam.nama_ujian,
      mata_pelajaran: exam.mata_pelajaran,
      kelas: exam.kelas,
      tanggal: exam.tanggal,
      jam_mulai: exam.jam_mulai,
      jam_selesai: exam.jam_selesai,
      durasi: exam.durasi,
      google_form_url: exam.google_form_url,
      status: exam.status,
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/exams/${editingId}`, {
          method: 'PATCH',
          token: authToken,
          body: form,
        });
        onNotify('success', 'Jadwal ujian berhasil diperbarui.');
      } else {
        await apiRequest('/api/exams', {
          method: 'POST',
          token: authToken,
          body: form,
        });
        onNotify('success', 'Jadwal ujian baru berhasil ditambahkan.');
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal menyimpan jadwal ujian.');
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickStatus(exam: Exam, status: ExamStatus) {
    try {
      await apiRequest(`/api/exams/${exam.id}`, {
        method: 'PATCH',
        token: authToken,
        body: { status },
      });
      onNotify('info', `Status "${exam.nama_ujian}" diubah menjadi ${status}.`);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal mengubah status ujian.');
    }
  }

  async function handleDelete(exam: Exam) {
    try {
      await apiRequest(`/api/exams/${exam.id}`, {
        method: 'DELETE',
        token: authToken,
      });
      onNotify('info', `Jadwal "${exam.nama_ujian}" dihapus.`);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal menghapus jadwal ujian.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Jadwal Ujian & URL Google Form</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Atur jadwal mata pelajaran, durasi, status pelaksanaan, serta tautan resmi Google Form soal ujian.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Tambah Jadwal Ujian
        </button>
      </div>

      {/* Exams Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {snapshot.exams.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Belum ada jadwal ujian terdaftar. Klik <strong>Tambah Jadwal Ujian</strong> untuk memulai.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nama Ujian & Mata Pelajaran</th>
                  <th className="py-3 px-4">Kelas</th>
                  <th className="py-3 px-4">Jadwal</th>
                  <th className="py-3 px-4 text-right">Durasi</th>
                  <th className="py-3 px-4">Google Form</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {snapshot.exams.map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{ex.nama_ujian}</div>
                      <div className="text-slate-500 mt-0.5">{ex.mata_pelajaran}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">{ex.kelas}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      <div>{ex.tanggal}</div>
                      <div className="text-slate-400">
                        {ex.jam_mulai} – {ex.jam_selesai}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {ex.durasi} mnt
                    </td>
                    <td className="py-3 px-4">
                      <a
                        href={ex.google_form_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium underline max-w-[180px] truncate"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Buka Form</span>
                      </a>
                    </td>
                    <td className="py-3 px-4">
                      <ExamStatusText status={ex.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {ex.status !== 'AKTIF' ? (
                          <button
                            type="button"
                            onClick={() => handleQuickStatus(ex, 'AKTIF')}
                            className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold transition-colors"
                          >
                            Aktifkan
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleQuickStatus(ex, 'SELESAI')}
                            className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                          >
                            Selesaikan
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(ex)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          aria-label={`Edit ${ex.nama_ujian}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {user.role === 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => handleDelete(ex)}
                            className="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                            aria-label={`Hapus ${ex.nama_ujian}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden">
            <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold">
                {editingId ? 'Edit Jadwal Ujian' : 'Tambah Jadwal Ujian Baru'}
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
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Ujian</label>
                  <input
                    type="text"
                    required
                    value={form.nama_ujian}
                    onChange={(e) => setForm({ ...form, nama_ujian: e.target.value })}
                    placeholder="Contoh: PAS Ganjil — Pemrograman Web"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
                  <input
                    type="text"
                    required
                    value={form.mata_pelajaran}
                    onChange={(e) => setForm({ ...form, mata_pelajaran: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                  <input
                    type="text"
                    required
                    value={form.kelas}
                    onChange={(e) => setForm({ ...form, kelas: e.target.value })}
                    placeholder="Contoh: XII RPL 1 atau SEMUA"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={form.tanggal}
                    onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Durasi (Menit)</label>
                  <input
                    type="number"
                    required
                    min={10}
                    max={360}
                    value={form.durasi}
                    onChange={(e) => setForm({ ...form, durasi: Number(e.target.value) || 90 })}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    required
                    value={form.jam_mulai}
                    onChange={(e) => setForm({ ...form, jam_mulai: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    required
                    value={form.jam_selesai}
                    onChange={(e) => setForm({ ...form, jam_selesai: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    URL Google Form (HTTPS resmi docs.google.com / forms.gle)
                  </label>
                  <input
                    type="url"
                    required
                    value={form.google_form_url}
                    onChange={(e) => setForm({ ...form, google_form_url: e.target.value })}
                    placeholder="https://docs.google.com/forms/d/e/.../viewform?embedded=true"
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status Pelaksanaan</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ExamStatus })}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="TERJADWAL">TERJADWAL</option>
                    <option value="AKTIF">AKTIF (Dibuka untuk peserta)</option>
                    <option value="SELESAI">SELESAI</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
