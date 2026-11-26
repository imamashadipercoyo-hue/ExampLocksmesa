import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './lib/api';
import { useDashboardRealtime, type RealtimeAlert } from './lib/useRealtime';
import type { DashboardSnapshot, StaffUser } from './types';
import { StaffAuthModal } from './components/StaffAuthModal';
import { StudentPortal } from './components/StudentPortal';
import { ToastContainer, type ToastItem } from './components/ToastContainer';
import { WorkspaceLayout } from './components/WorkspaceLayout';

export default function App() {
  // Staff session held strictly in React memory (never localStorage/sessionStorage)
  const [staffToken, setStaffToken] = useState<string | null>(null);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [viewMode, setViewMode] = useState<'STUDENT_GATE' | 'STAFF_DASHBOARD'>('STUDENT_GATE');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback(
    (severity: ToastItem['severity'], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, severity, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleRealtimeAlert = useCallback(
    (alert: RealtimeAlert) => {
      pushToast(alert.severity, alert.message);
    },
    [pushToast]
  );

  const { connected: realtimeConnected } = useDashboardRealtime(
    staffToken,
    setSnapshot,
    handleRealtimeAlert
  );

  // Initial snapshot fetch right after login so view populates immediately even before WS handshake finishes
  useEffect(() => {
    if (!staffToken) {
      setSnapshot(null);
      return;
    }
    apiRequest<DashboardSnapshot>('/api/dashboard/snapshot', { token: staffToken })
      .then((data) => setSnapshot(data))
      .catch(() => {});
  }, [staffToken]);

  function handleAuthenticated(token: string, user: StaffUser) {
    setStaffToken(token);
    setStaffUser(user);
    setViewMode('STAFF_DASHBOARD');
    pushToast(
      'success',
      `Selamat datang, ${user.full_name} (${user.role === 'ADMIN' ? 'Administrator' : 'Pengawas'}).`
    );
  }

  async function handleLogout() {
    if (staffToken) {
      await apiRequest('/api/auth/logout', { method: 'POST', token: staffToken }).catch(() => {});
    }
    setStaffToken(null);
    setStaffUser(null);
    setSnapshot(null);
    setViewMode('STUDENT_GATE');
    pushToast('info', 'Anda telah keluar dari sesi staff.');
  }

  function handleOpenStaffLogin() {
    if (staffToken && staffUser) {
      setViewMode('STAFF_DASHBOARD');
    } else {
      setAuthModalOpen(true);
    }
  }

  return (
    <>
      {viewMode === 'STAFF_DASHBOARD' && staffToken && staffUser ? (
        <WorkspaceLayout
          user={staffUser}
          authToken={staffToken}
          snapshot={snapshot}
          realtimeConnected={realtimeConnected}
          onLogout={handleLogout}
          onBackToStudentGate={() => setViewMode('STUDENT_GATE')}
          onNotify={pushToast}
        />
      ) : (
        <StudentPortal onOpenStaffLogin={handleOpenStaffLogin} onNotify={pushToast} />
      )}

      <StaffAuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
