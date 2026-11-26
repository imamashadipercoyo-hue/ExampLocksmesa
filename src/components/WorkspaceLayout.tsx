import { useState } from 'react';
import {
  Activity,
  BookOpen,
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { DashboardSnapshot, StaffUser } from '../types';
import { AuditLogView } from './AuditLogView';
import { BrandMark } from './BrandMark';
import { DashboardOverview } from './DashboardOverview';
import { DeploymentDocsView } from './DeploymentDocsView';
import { ExamsView } from './ExamsView';
import { GoogleSheetSyncView } from './GoogleSheetSyncView';
import { MonitoringView } from './MonitoringView';
import { SessionDetailModal } from './SessionDetailModal';
import { StaffManagementView } from './StaffManagementView';
import { StudentsView } from './StudentsView';
import { TokensView } from './TokensView';
import { ViolationsView } from './ViolationsView';

interface WorkspaceLayoutProps {
  user: StaffUser;
  authToken: string;
  snapshot: DashboardSnapshot | null;
  realtimeConnected: boolean;
  onLogout: () => void;
  onBackToStudentGate: () => void;
  onNotify: (severity: 'success' | 'info' | 'warning' | 'danger', message: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  badgeCount?: number;
}

export function WorkspaceLayout({
  user,
  authToken,
  snapshot,
  realtimeConnected,
  onLogout,
  onBackToStudentGate,
  onNotify,
}: WorkspaceLayoutProps) {
  const isAdmin = user.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const lockedCount = snapshot?.stats.terkunci ?? 0;

  const operationalItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard Realtime', icon: LayoutDashboard },
    { id: 'monitoring', label: 'Monitoring Peserta', icon: Activity, badgeCount: lockedCount },
    { id: 'violations', label: 'Log Pelanggaran', icon: ShieldAlert },
    { id: 'tokens', label: 'Manajemen Token', icon: KeyRound },
    { id: 'exams', label: 'Jadwal & Google Form', icon: CalendarClock },
    { id: 'students', label: isAdmin ? 'Master Input Siswa' : 'Data Siswa', icon: Users },
  ];

  const adminExclusiveItems: NavItem[] = [
    { id: 'sheet-sync', label: 'Google Sheet & Script', icon: FileSpreadsheet, adminOnly: true },
    { id: 'staff', label: 'Akun Pengawas & Admin', icon: UserCog, adminOnly: true },
    { id: 'audit', label: 'Audit Log Sistem', icon: ClipboardList, adminOnly: true },
    { id: 'docs', label: 'SQL & Panduan Deploy', icon: BookOpen, adminOnly: true },
  ];

  const allNavItems = isAdmin ? [...operationalItems, ...adminExclusiveItems] : operationalItems;
  const activeNavLabel = allNavItems.find((n) => n.id === activeTab)?.label || 'Dashboard';

  function handleSelectTab(id: string) {
    setActiveTab(id);
    setMobileNavOpen(false);
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B1F3A] text-white">
      {/* Brand Block */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
        <BrandMark size="sm" />
        <div className="min-w-0">
          <div className="text-sm font-extrabold tracking-tight text-white truncate">UJIAN LOCK SMESA</div>
          <div className="text-[11px] text-blue-200 truncate">SMK Negeri 1 Jember</div>
        </div>
      </div>

      {/* Role Context Header */}
      <div className="px-5 py-3 border-b border-white/10 bg-white/5">
        <div className="text-[11px] font-semibold text-blue-300 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          {isAdmin ? 'Mode Administrator (Akses Penuh)' : 'Mode Pengawas Ruang'}
        </div>
        <div className="text-xs font-semibold text-white truncate mt-0.5">{user.full_name}</div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <div className="space-y-1">
          <div className="px-3 text-[11px] font-semibold text-blue-300/80 mb-2">
            Operasional Ujian
          </div>
          {operationalItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-100/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badgeCount && item.badgeCount > 0 ? (
                  <span className="font-mono text-[11px] font-bold text-red-200 bg-red-700/80 px-1.5 py-0.5 rounded">
                    {item.badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {isAdmin && (
          <div className="space-y-1 pt-3 border-t border-white/10">
            <div className="px-3 text-[11px] font-semibold text-blue-300/80 mb-2">
              Administrasi Sistem
            </div>
            {adminExclusiveItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-blue-700 text-white'
                      : 'text-blue-100/85 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-white/10 space-y-1.5">
        <button
          type="button"
          onClick={onBackToStudentGate}
          className="w-full px-3 py-2 rounded-lg text-xs font-medium text-blue-100 hover:bg-white/10 transition-colors text-left"
        >
          Buka Halaman Gerbang Siswa
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-red-200 hover:bg-red-950/60 transition-colors flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Keluar Akun
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full shrink-0 relative">
            {sidebarContent}
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-4 right-3 p-1.5 text-blue-200 hover:text-white"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div
            className="flex-1 bg-slate-950/60"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Breadcrumb Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-5 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs text-slate-500 flex items-center gap-2 truncate">
              <span className="font-semibold text-slate-700 hidden sm:inline">
                {isAdmin ? 'Admin SMESA' : 'Pengawas SMESA'}
              </span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <span className="font-bold text-[#0B1F3A] truncate">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Real WebSocket connection state (authentic live telemetry) */}
            <div className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
              {realtimeConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 hidden sm:inline">Realtime Terhubung</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-amber-700 hidden sm:inline">Menyambung ulang...</span>
                </>
              )}
            </div>

            {isAdmin && snapshot?.sheet_sync_summary.configured && (
              <button
                type="button"
                onClick={() => setActiveTab('sheet-sync')}
                className="hidden md:inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-[#0B1F3A] whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>
                  Sheet: {snapshot.sheet_sync_summary.auto_sync_enabled ? 'Auto-Sync Aktif' : 'Manual'}
                </span>
              </button>
            )}
          </div>
        </header>

        {/* Active View Content */}
        <main className="flex-1 p-5 lg:p-8 max-w-[1440px] w-full mx-auto">
          {!snapshot ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Menghubungkan ke server realtime UJIAN LOCK SMESA...
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardOverview
                  snapshot={snapshot}
                  user={user}
                  onSelectSession={setSelectedSessionId}
                  onNavigate={setActiveTab}
                />
              )}
              {activeTab === 'monitoring' && (
                <MonitoringView snapshot={snapshot} onSelectSession={setSelectedSessionId} />
              )}
              {activeTab === 'violations' && (
                <ViolationsView snapshot={snapshot} onSelectSession={setSelectedSessionId} />
              )}
              {activeTab === 'tokens' && (
                <TokensView snapshot={snapshot} authToken={authToken} onNotify={onNotify} />
              )}
              {activeTab === 'exams' && (
                <ExamsView snapshot={snapshot} user={user} authToken={authToken} onNotify={onNotify} />
              )}
              {activeTab === 'students' && (
                <StudentsView
                  snapshot={snapshot}
                  user={user}
                  authToken={authToken}
                  onNotify={onNotify}
                  onNavigate={isAdmin ? setActiveTab : undefined}
                />
              )}
              {activeTab === 'sheet-sync' && isAdmin && (
                <GoogleSheetSyncView authToken={authToken} onNotify={onNotify} />
              )}
              {activeTab === 'staff' && isAdmin && (
                <StaffManagementView authToken={authToken} currentUser={user} onNotify={onNotify} />
              )}
              {activeTab === 'audit' && isAdmin && (
                <AuditLogView authToken={authToken} onNotify={onNotify} />
              )}
              {activeTab === 'docs' && isAdmin && (
                <DeploymentDocsView authToken={authToken} onNotify={onNotify} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Participant Detail & Unlock Modal */}
      <SessionDetailModal
        sessionId={selectedSessionId}
        authToken={authToken}
        onClose={() => setSelectedSessionId(null)}
        onNotify={onNotify}
      />
    </div>
  );
}
