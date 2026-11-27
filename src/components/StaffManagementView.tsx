import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { ApiError, apiRequest, formatDateTime } from '../lib/api';
import type { StaffUser } from '../types';

interface StaffManagementViewProps {
  authToken: string;
  currentUser: StaffUser;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

export function StaffManagementView({ authToken, currentUser, onNotify }: StaffManagementViewProps) {
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'PENGAWAS' | 'ADMIN'>('PENGAWAS');
  const [password, setPassword] = useState('');
  const [classesInput, setClassesInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [passwordModalUser, setPasswordModalUser] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [syncingDirection, setSyncingDirection] = useState<'pull' | 'push' | null>(null);

  const loadStaff = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ staff: StaffUser[] }>('/api/admin/staff', { token: authToken });
      setStaffList(res.staff);
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal memuat daftar akun staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const assignedClasses = classesInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      await apiRequest('/api/admin/staff', {
        method: 'POST',
        token: authToken,
        body: {
          username,
          full_name: fullName,
          role,
          password,
          assigned_classes: assignedClasses,
        },
      });
      onNotify('success', `Akun ${role} (${username}) berhasil dibuat.`);
      setUsername('');
      setFullName('');
      setPassword('');
      setClassesInput('');
      await loadStaff();
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal membuat akun staff.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(staff: StaffUser) {
    try {
      await apiRequest(`/api/admin/staff/${staff.id}`, {
        method: 'PATCH',
        token: authToken,
        body: { active: !staff.active },
      });
      onNotify('info', `Akun ${staff.username} ${!staff.active ? 'diaktifkan' : 'dinonaktifkan'}.`);
      await loadStaff();
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal mengubah status akun.');
    }
  }

  function openPasswordModal(staff: StaffUser) {
    setPasswordModalUser(staff);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setPasswordError('');
  }

  async function handleUpdatePassword(e: FormEvent) {
    e.preventDefault();
    if (!passwordModalUser) return;
    setPasswordError('');
    if (newPassword.trim().length < 6) {
      setPasswordError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setSavingPassword(true);
    try {
      await apiRequest(`/api/admin/staff/${passwordModalUser.id}`, {
        method: 'PATCH',
        token: authToken,
        body: { password: newPassword.trim() },
      });
      onNotify('success', `Kata sandi untuk akun ${passwordModalUser.username} berhasil diperbarui.`);
      setPasswordModalUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Gagal memperbarui kata sandi.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/admin/staff/${deleteTarget.id}`, {
        method: 'DELETE',
        token: authToken,
      });
      onNotify('info', `Akun ${deleteTarget.role} (${deleteTarget.username}) berhasil dihapus.`);
      setDeleteTarget(null);
      await loadStaff();
    } catch (err) {
      onNotify('danger', err instanceof ApiError ? err.message : 'Gagal menghapus akun staff.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSheetSync(direction: 'pull' | 'push') {
    setSyncingDirection(direction);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>(
        `/api/admin/sheet-sync/${direction}`,
        { method: 'POST', token: authToken }
      );
      onNotify('success', res.message);
      if (direction === 'pull') {
        await loadStaff();
      }
    } catch (err) {
      onNotify(
        'danger',
        err instanceof ApiError
          ? err.message
          : 'Gagal sinkronisasi dengan Google Sheet. Pastikan URL Apps Script sudah diatur.'
      );
    } finally {
      setSyncingDirection(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Manajemen Akun Pengawas & Admin</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Terhubung dua arah dengan tab <code className="font-mono text-blue-800">staff_users</code> di Google Sheet
            untuk memudahkan pendaftaran massal akun Pengawas & Admin.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            disabled={syncingDirection !== null}
            onClick={() => handleSheetSync('pull')}
            className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-blue-700" />
            {syncingDirection === 'pull' ? 'Menarik...' : 'Tarik Akun dari Sheet'}
          </button>
          <button
            type="button"
            disabled={syncingDirection !== null}
            onClick={() => handleSheetSync('push')}
            className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5" />
            {syncingDirection === 'push' ? 'Mengirim...' : 'Kirim Akun ke Sheet'}
          </button>
        </div>
      </div>

      {/* Google Sheet Registration Tip */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700 flex items-start gap-2.5 leading-relaxed">
        <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
        <span>
          <strong>Pendaftaran Akun via Google Sheet:</strong> Tambahkan baris baru pada tab{' '}
          <code className="font-mono text-blue-900">staff_users</code> dengan kolom{' '}
          <code className="font-mono text-blue-900">
            username, full_name, role (ADMIN/PENGAWAS), assigned_classes, active (AKTIF), password (min. 6 karakter)
          </code>
          . Saat sinkronisasi berjalan, server otomatis mengenkripsi kata sandi dengan <code className="font-mono">scrypt</code>{' '}
          dan mengganti kolom sandi di Google Sheet menjadi <code className="font-mono">[TERENKRIPSI]</code> agar tetap aman.
        </span>
      </div>

      {/* Add Staff Form */}
      <form
        onSubmit={handleCreate}
        className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
      >
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Username</label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="pengawas_lab2"
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Nama Lengkap</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Budi Santoso, S.Pd"
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Peran (Role)</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'PENGAWAS' | 'ADMIN')}
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="PENGAWAS">PENGAWAS</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Kata Sandi</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 karakter"
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Kelas Pengawasan
          </label>
          <input
            type="text"
            value={classesInput}
            onChange={(e) => setClassesInput(e.target.value)}
            placeholder="Kosong = semua kelas"
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <div className="md:col-span-1">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-3 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Tambah
          </button>
        </div>
      </form>

      {/* Staff Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">Memuat daftar staff...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Peran</th>
                  <th className="py-3 px-4">Cakupan Kelas</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Dibuat</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {staffList.map((st) => (
                  <tr key={st.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">{st.username}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{st.full_name}</td>
                    <td className="py-3 px-4">
                      {st.role === 'ADMIN' ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#0B1F3A]">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                          <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                          Pengawas
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {st.role === 'ADMIN' || st.assigned_classes.length === 0
                        ? 'Seluruh Kelas'
                        : st.assigned_classes.join(', ')}
                    </td>
                    <td className="py-3 px-4">
                      {st.active ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-400">
                          <XCircle className="w-3.5 h-3.5" />
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 tabular-nums">
                      {formatDateTime(st.created_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openPasswordModal(st)}
                          className="px-2.5 py-1.5 rounded-md border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-800 font-semibold transition-colors inline-flex items-center gap-1"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Ubah Sandi
                        </button>
                        {st.id !== currentUser.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(st)}
                              className="px-2.5 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold transition-colors"
                            >
                              {st.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(st)}
                              className="px-2.5 py-1.5 rounded-md border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-700 font-semibold transition-colors inline-flex items-center gap-1"
                              aria-label={`Hapus akun ${st.username}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Hapus
                            </button>
                          </>
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

      {/* Modal Ubah Kata Sandi */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full shadow-2xl overflow-hidden">
            <div className="bg-[#0B1F3A] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold">Ubah Kata Sandi Akun</h2>
                <p className="text-xs text-blue-200 mt-0.5">
                  {passwordModalUser.full_name} (<span className="font-mono">{passwordModalUser.username}</span>)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="p-1 text-blue-200 hover:text-white"
                aria-label="Tutup modal ubah sandi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdatePassword} className="p-5 space-y-4">
              {passwordError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {passwordError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kata Sandi Baru (min. 6 karakter)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Masukkan kata sandi baru"
                    className="w-full pl-3.5 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label={showNewPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang kata sandi baru"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {savingPassword ? 'Menyimpan...' : 'Simpan Sandi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Akun */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full shadow-2xl overflow-hidden">
            <div className="bg-red-700 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <h2 className="text-sm font-bold">Konfirmasi Hapus Akun</h2>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1 text-red-100 hover:text-white"
                aria-label="Tutup konfirmasi hapus"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-700 leading-relaxed">
                Anda yakin ingin menghapus akun{' '}
                <strong className="text-slate-900">{deleteTarget.full_name}</strong> (
                <code className="font-mono text-slate-900">{deleteTarget.username}</code> —{' '}
                <strong className="text-slate-900">{deleteTarget.role}</strong>)? Tindakan ini akan
                mencabut akses login akun tersebut dan memperbarui data ke Google Sheet.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleting ? 'Menghapus...' : 'Ya, Hapus Akun'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
