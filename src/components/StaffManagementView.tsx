import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Plus, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Manajemen Akun Pengawas & Admin</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Khusus Admin. Tambahkan akun pengawas ruang dan batasi kelas pengawasan sesuai pembagian tugas.
        </p>
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
                    <td className="py-3 px-4 text-right">
                      {st.id === currentUser.id ? (
                        <span className="text-slate-400">Akun aktif Anda</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(st)}
                          className="px-2.5 py-1 rounded-md border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold transition-colors"
                        >
                          {st.active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
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
