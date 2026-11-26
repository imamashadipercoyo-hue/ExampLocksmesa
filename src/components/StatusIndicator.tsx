import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import type { ExamStatus, SessionStatus, TokenStatus, ViolationType } from '../types';

export function SessionStatusText({ status }: { status: SessionStatus }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <PlayCircle className="w-3.5 h-3.5 shrink-0" />
          Aktif
        </span>
      );
    case 'WARNING':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Warning
        </span>
      );
    case 'LOCKED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          Terkunci
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Selesai
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Belum Mulai
        </span>
      );
  }
}

export function TokenStatusText({ status }: { status: TokenStatus }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Aktif
        </span>
      );
    case 'USED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 whitespace-nowrap">
          <PlayCircle className="w-3.5 h-3.5 shrink-0" />
          Terpakai
        </span>
      );
    case 'EXPIRED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Kedaluwarsa
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          Invalid
        </span>
      );
  }
}

export function ExamStatusText({ status }: { status: ExamStatus }) {
  switch (status) {
    case 'AKTIF':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <PlayCircle className="w-3.5 h-3.5 shrink-0" />
          Aktif
        </span>
      );
    case 'TERJADWAL':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Terjadwal
        </span>
      );
    case 'SELESAI':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Selesai
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap">
          Draft
        </span>
      );
  }
}

export function formatViolationLabel(type: ViolationType): string {
  switch (type) {
    case 'tab_switch':
      return 'Pindah Tab (tab_switch)';
    case 'window_blur':
      return 'Kehilangan Fokus (window_blur)';
    case 'fullscreen_exit':
      return 'Keluar Fullscreen (fullscreen_exit)';
    case 'page_visibility_hidden':
      return 'Halaman Tersembunyi (page_visibility_hidden)';
    case 'attempt_leave_page':
      return 'Mencoba Tinggalkan Halaman (attempt_leave_page)';
    case 'session_reconnect':
      return 'Sambung Ulang Sesi (session_reconnect)';
  }
}
