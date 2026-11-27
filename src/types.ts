export type UserRole = 'ADMIN' | 'PENGAWAS' | 'SISWA';

export type StudentStatus = 'AKTIF' | 'NONAKTIF';

export type ExamStatus = 'DRAFT' | 'TERJADWAL' | 'AKTIF' | 'SELESAI';

export type SessionStatus =
  | 'NOT_STARTED'
  | 'ACTIVE'
  | 'WARNING'
  | 'LOCKED'
  | 'COMPLETED';

export type TokenStatus = 'ACTIVE' | 'USED' | 'INVALID' | 'EXPIRED';

export type ViolationType =
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'page_visibility_hidden'
  | 'attempt_leave_page'
  | 'session_reconnect';

export type AuditAction =
  | 'login'
  | 'logout'
  | 'validasi_token'
  | 'mulai_ujian'
  | 'fullscreen'
  | 'keluar_fullscreen'
  | 'tab_switch'
  | 'window_blur'
  | 'attempt_leave_page'
  | 'session_reconnect'
  | 'warning'
  | 'lock'
  | 'generate_token'
  | 'revoke_token'
  | 'unlock'
  | 'token_baru'
  | 'selesai_ujian'
  | 'student_upsert'
  | 'student_bulk_import'
  | 'major_upsert'
  | 'major_bulk_import'
  | 'exam_upsert'
  | 'sheet_sync_push'
  | 'sheet_sync_pull'
  | 'staff_upsert';

export interface Major {
  id: string;
  kode: string;
  nama_jurusan: string;
  status: StudentStatus;
  updated_at: string;
}

export interface Student {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  jurusan: string;
  status: StudentStatus;
  updated_at: string;
}

export interface Exam {
  id: string;
  nama_ujian: string;
  mata_pelajaran: string;
  kelas: string;
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  durasi: number; // minutes
  google_form_url: string;
  status: ExamStatus;
  created_at: string;
  updated_at: string;
}

export interface TokenRecord {
  id: string;
  code: string;
  exam_id: string;
  student_id: string | null; // null = general exam token (binds on first use), non-null = personal unlock token
  used_by_student_id: string | null;
  status: TokenStatus;
  is_unlock_token: boolean;
  expires_at: string;
  issued_by: string;
  issued_by_role: 'ADMIN' | 'PENGAWAS';
  issued_at: string;
  invalidated_at: string | null;
}

export interface ExamSession {
  session_id: string;
  exam_id: string;
  student_id: string;
  started_at: string | null;
  ended_at: string | null;
  status: SessionStatus;
  violation_count: number;
  current_token_id: string | null;
  last_activity: string;
  last_activity_at: string;
  unlocked_count: number;
  is_fullscreen: boolean;
}

export interface Violation {
  id: string;
  session_id: string;
  exam_id: string;
  student_id: string;
  event_type: ViolationType;
  detail: string;
  violation_number: number;
  resulting_status: SessionStatus;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  session_id: string | null;
  exam_id: string | null;
  student_id: string | null;
  actor_name: string;
  actor_role: UserRole | 'SYSTEM';
  activity: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  actor_name: string;
  actor_role: UserRole | 'SYSTEM';
  target_id: string | null;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
  created_at: string;
}

export interface StaffUser {
  id: string;
  username: string;
  full_name: string;
  role: 'ADMIN' | 'PENGAWAS';
  assigned_classes: string[]; // empty = all classes
  active: boolean;
  created_at: string;
}

export interface SheetSyncHistoryItem {
  id: string;
  direction: 'PUSH' | 'PULL';
  status: 'SUCCESS' | 'ERROR';
  message: string;
  records_affected: number;
  triggered_by: string;
  created_at: string;
}

export interface SheetSyncConfig {
  web_app_url: string;
  has_secret: boolean;
  auto_sync_enabled: boolean;
  auto_sync_interval_sec: number; // 0, 30, 60, 300
  auto_push_on_change: boolean;
  last_sync_at: string | null;
  last_sync_status: 'IDLE' | 'SUCCESS' | 'ERROR';
  last_sync_message: string;
  history: SheetSyncHistoryItem[];
}

export interface EnrichedSession extends ExamSession {
  student_nis: string;
  student_nama: string;
  student_kelas: string;
  student_jurusan: string;
  exam_nama: string;
  exam_mapel: string;
  current_token_code: string | null;
}

export interface EnrichedViolation extends Violation {
  student_nis: string;
  student_nama: string;
  student_kelas: string;
  exam_nama: string;
}

export interface EnrichedToken extends TokenRecord {
  exam_nama: string;
  assigned_student_nama: string | null;
  assigned_student_nis: string | null;
  used_by_student_nama: string | null;
  used_by_student_nis: string | null;
}

export interface DashboardStats {
  total_peserta: number;
  belum_mulai: number;
  aktif: number;
  warning: number;
  terkunci: number;
  selesai: number;
  jumlah_pelanggaran: number;
}

export interface DashboardSnapshot {
  stats: DashboardStats;
  sessions: EnrichedSession[];
  violations: EnrichedViolation[];
  activities: ActivityLog[];
  majors: Major[];
  students: Student[];
  exams: Exam[];
  tokens: EnrichedToken[];
  sheet_sync_summary: {
    configured: boolean;
    auto_sync_enabled: boolean;
    last_sync_at: string | null;
    last_sync_status: 'IDLE' | 'SUCCESS' | 'ERROR';
  };
  server_time: string;
}

export interface StudentSessionPayload {
  token: string;
  session: ExamSession;
  student: Student;
  exam: Exam;
  active_token_code: string;
}

export interface ViolationResponse {
  violation: Violation;
  session: ExamSession;
  warning_level: 1 | 2 | 3;
  modal_title: string;
  modal_message: string;
  locked: boolean;
}
