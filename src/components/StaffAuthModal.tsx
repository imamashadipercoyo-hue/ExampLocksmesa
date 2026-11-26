import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck, UserCheck, X } from 'lucide-react';
import { apiRequest, ApiError } from '../lib/api';
import type { StaffUser } from '../types';
import { BrandMark } from './BrandMark';

interface StaffAuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, user: StaffUser) => void;
}

export function StaffAuthModal({ open, onClose, onAuthenticated }: StaffAuthModalProps) {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  // Login state
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');

  // First-run bootstrap state
  const [adminName, setAdminName] = useState('Administrator SMESA');
  const [adminPassword, setAdminPassword] = useState('');
  const [pengawasName, setPengawasName] = useState('Pengawas Ujian SMESA');
  const [pengawasPassword, setPengawasPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setLoadingStatus(true);
    apiRequest<{ needs_bootstrap: boolean; env_managed: boolean }>('/api/auth/status')
      .then((res) => {
        setNeedsBootstrap(res.needs_bootstrap);
      })
      .catch(() => {
        setError('Gagal memeriksa status autentikasi server.');
      })
      .finally(() => setLoadingStatus(false));
  }, [open]);

  if (!open) return null;

  async function handleBootstrap(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ token: string; user: StaffUser }>('/api/auth/bootstrap', {
        method: 'POST',
        body: {
          admin_name: adminName,
          admin_password: adminPassword,
          pengawas_name: pengawasName,
          pengawas_password: pengawasPassword,
        },
      });
      onAuthenticated(res.token, res.user);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengaktifkan akun.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ token: string; user: StaffUser }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      onAuthenticated(res.token, res.user);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login gagal.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="bg-[#0B1F3A] text-white px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" />
            <div>
              <h2 className="text-base font-bold leading-tight">
                {needsBootstrap ? 'Aktivasi Akun Pertama Kali' : 'Portal Pengawas & Admin'}
              </h2>
              <p className="text-xs text-blue-200 mt-0.5">SMK Negeri 1 Jember</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {loadingStatus ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Memeriksa konfigurasi autentikasi...
            </div>
          ) : needsBootstrap ? (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-slate-700 leading-relaxed">
                Buat kata sandi awal untuk akun <strong className="font-semibold">Admin</strong> (username:{' '}
                <code className="font-mono text-blue-800">admin</code>) dan{' '}
                <strong className="font-semibold">Pengawas</strong> (username:{' '}
                <code className="font-mono text-blue-800">pengawas</code>). Kata sandi disimpan aman dengan hashing
                scrypt di server.
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Administrator
                  </label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi Admin (min. 6 karakter)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Masukkan kata sandi Admin"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Pengawas Utama
                  </label>
                  <input
                    type="text"
                    required
                    value={pengawasName}
                    onChange={(e) => setPengawasName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi Pengawas (min. 6 karakter)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={pengawasPassword}
                    onChange={(e) => setPengawasPassword(e.target.value)}
                    placeholder="Masukkan kata sandi Pengawas"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {submitting ? 'Mengaktifkan...' : 'Aktifkan & Masuk sebagai Admin'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setUsername('pengawas')}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                    username !== 'admin'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Pengawas
                </button>
                <button
                  type="button"
                  onClick={() => setUsername('admin')}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                    username === 'admin'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Admin
                </button>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin atau pengawas"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kata Sandi
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0B1F3A] hover:bg-blue-900 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {submitting ? 'Memverifikasi...' : 'Masuk Dashboard'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
