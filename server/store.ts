import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  ActivityLog,
  AuditAction,
  AuditLog,
  DashboardSnapshot,
  DashboardStats,
  EnrichedSession,
  EnrichedToken,
  EnrichedViolation,
  Exam,
  ExamSession,
  Major,
  SheetSyncConfig,
  SheetSyncHistoryItem,
  StaffUser,
  Student,
  TokenRecord,
  UserRole,
  Violation,
  ViolationType,
} from '../src/types.ts';

export interface StoredStaffUser extends StaffUser {
  password_hash: string;
}

export interface PersistedDatabase {
  initialized_auth: boolean;
  staff_users: StoredStaffUser[];
  majors: Major[];
  students: Student[];
  exams: Exam[];
  tokens: TokenRecord[];
  exam_sessions: ExamSession[];
  violations: Violation[];
  activity_logs: ActivityLog[];
  audit_logs: AuditLog[];
  sheet_sync: {
    web_app_url: string;
    sync_secret: string;
    auto_sync_enabled: boolean;
    auto_sync_interval_sec: number;
    auto_push_on_change: boolean;
    last_sync_at: string | null;
    last_sync_status: 'IDLE' | 'SUCCESS' | 'ERROR';
    last_sync_message: string;
    history: SheetSyncHistoryItem[];
  };
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'smesa-db.json');

// Signing secret for HMAC-SHA256 Bearer tokens (strictly in server memory)
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export interface BearerPayload {
  sub: string;
  role: UserRole;
  name: string;
  session_id?: string;
  exam_id?: string;
  exp: number;
}

export function signBearerToken(payload: Omit<BearerPayload, 'exp'>, ttlSeconds = 60 * 60 * 8): string {
  const fullPayload: BearerPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyBearerToken(token: string): BearerPayload | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as BearerPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateUniqueTokenCode(prefix = 'SMS'): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    part += alphabet[bytes[i] % alphabet.length];
  }
  return `${prefix}-${part}`;
}

export function validateGoogleFormUrl(rawUrl: string): { valid: boolean; normalized: string; error?: string } {
  try {
    const trimmed = rawUrl.trim();
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { valid: false, normalized: '', error: 'URL Google Form wajib menggunakan protokol HTTPS.' };
    }
    const allowedHosts = ['docs.google.com', 'forms.gle'];
    const hostOk = allowedHosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
    if (!hostOk) {
      return {
        valid: false,
        normalized: '',
        error: 'URL harus berasal dari domain resmi Google Form (docs.google.com atau forms.gle).',
      };
    }
    return { valid: true, normalized: parsed.toString() };
  } catch {
    return { valid: false, normalized: '', error: 'Format URL Google Form tidak valid.' };
  }
}

function createDefaultMajors(nowIso: string): Major[] {
  return [
    { id: 'maj-rpl', kode: 'RPL', nama_jurusan: 'Rekayasa Perangkat Lunak', status: 'AKTIF', updated_at: nowIso },
    { id: 'maj-tkj', kode: 'TKJ', nama_jurusan: 'Teknik Komputer & Jaringan', status: 'AKTIF', updated_at: nowIso },
    { id: 'maj-akl', kode: 'AKL', nama_jurusan: 'Akuntansi & Keuangan Lembaga', status: 'AKTIF', updated_at: nowIso },
    { id: 'maj-bdp', kode: 'BDP', nama_jurusan: 'Bisnis Daring & Pemasaran', status: 'AKTIF', updated_at: nowIso },
    { id: 'maj-otkp', kode: 'OTKP', nama_jurusan: 'Otomatisasi & Tata Kelola Perkantoran', status: 'AKTIF', updated_at: nowIso },
    { id: 'maj-dkv', kode: 'DKV', nama_jurusan: 'Desain Komunikasi Visual', status: 'AKTIF', updated_at: nowIso },
  ];
}

function createInitialSeed(): PersistedDatabase {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  const expiryIso = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();

  const majors: Major[] = createDefaultMajors(nowIso);

  const students: Student[] = [
    { id: 'stu-001', nis: '2024001', nama: 'Ahmad Fajar Pratama', kelas: 'XII RPL 1', jurusan: 'Rekayasa Perangkat Lunak', status: 'AKTIF', updated_at: nowIso },
    { id: 'stu-002', nis: '2024002', nama: 'Aulia Rahmawati', kelas: 'XII RPL 1', jurusan: 'Rekayasa Perangkat Lunak', status: 'AKTIF', updated_at: nowIso },
    { id: 'stu-003', nis: '2024003', nama: 'Bagus Setiawan', kelas: 'XII RPL 1', jurusan: 'Rekayasa Perangkat Lunak', status: 'AKTIF', updated_at: nowIso },
    { id: 'stu-004', nis: '2024004', nama: 'Citra Dewi Lestari', kelas: 'XII TKJ 1', jurusan: 'Teknik Komputer & Jaringan', status: 'AKTIF', updated_at: nowIso },
    { id: 'stu-005', nis: '2024005', nama: 'Dimas Arya Saputra', kelas: 'XII TKJ 1', jurusan: 'Teknik Komputer & Jaringan', status: 'AKTIF', updated_at: nowIso },
    { id: 'stu-006', nis: '2024006', nama: 'Eka Putri Wulandari', kelas: 'XII AKL 1', jurusan: 'Akuntansi & Keuangan Lembaga', status: 'AKTIF', updated_at: nowIso },
    { id: 'stu-007', nis: '2024007', nama: 'Farhan Hidayatullah', kelas: 'XII AKL 1', jurusan: 'Akuntansi & Keuangan Lembaga', status: 'AKTIF', updated_at: nowIso },
    { id: 'stu-008', nis: '2024008', nama: 'Gita Nirmala Sari', kelas: 'XII BDP 1', jurusan: 'Bisnis Daring & Pemasaran', status: 'AKTIF', updated_at: nowIso },
  ];

  const exams: Exam[] = [
    {
      id: 'exm-001',
      nama_ujian: 'Penilaian Akhir Semester — Pemrograman Web',
      mata_pelajaran: 'Pemrograman Web & Perangkat Bergerak',
      kelas: 'XII RPL 1',
      tanggal: today,
      jam_mulai: '07:30',
      jam_selesai: '09:30',
      durasi: 90,
      google_form_url: 'https://docs.google.com/forms/d/e/1FAIpQLSf_SMESA_DEMO_FORM/viewform?embedded=true',
      status: 'AKTIF',
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'exm-002',
      nama_ujian: 'Ujian Kompetensi Keahlian — Administrasi Jaringan',
      mata_pelajaran: 'Administrasi Infrastruktur Jaringan',
      kelas: 'XII TKJ 1',
      tanggal: today,
      jam_mulai: '10:00',
      jam_selesai: '11:30',
      durasi: 90,
      google_form_url: 'https://docs.google.com/forms/d/e/1FAIpQLSf_SMESA_TKJ_DEMO/viewform?embedded=true',
      status: 'AKTIF',
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'exm-003',
      nama_ujian: 'Try Out Akuntansi Perusahaan Manufaktur',
      mata_pelajaran: 'Praktikum Akuntansi',
      kelas: 'XII AKL 1',
      tanggal: today,
      jam_mulai: '13:00',
      jam_selesai: '14:30',
      durasi: 90,
      google_form_url: 'https://docs.google.com/forms/d/e/1FAIpQLSf_SMESA_AKL_DEMO/viewform?embedded=true',
      status: 'TERJADWAL',
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  const tokens: TokenRecord[] = [
    {
      id: 'tok-001',
      code: 'SMS-RPL201',
      exam_id: 'exm-001',
      student_id: null,
      used_by_student_id: null,
      status: 'ACTIVE',
      is_unlock_token: false,
      expires_at: expiryIso,
      issued_by: 'Administrator SMESA',
      issued_by_role: 'ADMIN',
      issued_at: nowIso,
      invalidated_at: null,
    },
    {
      id: 'tok-002',
      code: 'SMS-RPL202',
      exam_id: 'exm-001',
      student_id: null,
      used_by_student_id: null,
      status: 'ACTIVE',
      is_unlock_token: false,
      expires_at: expiryIso,
      issued_by: 'Administrator SMESA',
      issued_by_role: 'ADMIN',
      issued_at: nowIso,
      invalidated_at: null,
    },
    {
      id: 'tok-003',
      code: 'SMS-TKJ301',
      exam_id: 'exm-002',
      student_id: null,
      used_by_student_id: null,
      status: 'ACTIVE',
      is_unlock_token: false,
      expires_at: expiryIso,
      issued_by: 'Pengawas Lab 1',
      issued_by_role: 'PENGAWAS',
      issued_at: nowIso,
      invalidated_at: null,
    },
  ];

  const exam_sessions: ExamSession[] = [
    {
      session_id: 'ses-001',
      exam_id: 'exm-001',
      student_id: 'stu-002',
      started_at: new Date(now.getTime() - 18 * 60000).toISOString(),
      ended_at: null,
      status: 'ACTIVE',
      violation_count: 0,
      current_token_id: null,
      last_activity: 'Mengerjakan soal dalam mode Fullscreen',
      last_activity_at: new Date(now.getTime() - 2 * 60000).toISOString(),
      unlocked_count: 0,
      is_fullscreen: true,
    },
    {
      session_id: 'ses-002',
      exam_id: 'exm-001',
      student_id: 'stu-003',
      started_at: new Date(now.getTime() - 25 * 60000).toISOString(),
      ended_at: null,
      status: 'WARNING',
      violation_count: 1,
      current_token_id: null,
      last_activity: 'Pelanggaran 1: tab_switch terdeteksi',
      last_activity_at: new Date(now.getTime() - 4 * 60000).toISOString(),
      unlocked_count: 0,
      is_fullscreen: true,
    },
    {
      session_id: 'ses-003',
      exam_id: 'exm-002',
      student_id: 'stu-004',
      started_at: new Date(now.getTime() - 30 * 60000).toISOString(),
      ended_at: null,
      status: 'LOCKED',
      violation_count: 3,
      current_token_id: null,
      last_activity: 'Ujian dikunci otomatis setelah pelanggaran ke-3 (fullscreen_exit)',
      last_activity_at: new Date(now.getTime() - 1 * 60000).toISOString(),
      unlocked_count: 0,
      is_fullscreen: false,
    },
    {
      session_id: 'ses-004',
      exam_id: 'exm-002',
      student_id: 'stu-005',
      started_at: new Date(now.getTime() - 45 * 60000).toISOString(),
      ended_at: new Date(now.getTime() - 5 * 60000).toISOString(),
      status: 'COMPLETED',
      violation_count: 0,
      current_token_id: null,
      last_activity: 'Menyelesaikan ujian dengan tertib',
      last_activity_at: new Date(now.getTime() - 5 * 60000).toISOString(),
      unlocked_count: 0,
      is_fullscreen: false,
    },
  ];

  const violations: Violation[] = [
    {
      id: 'vio-001',
      session_id: 'ses-002',
      exam_id: 'exm-001',
      student_id: 'stu-003',
      event_type: 'tab_switch',
      detail: 'Document visibility berubah menjadi hidden saat ujian berlangsung',
      violation_number: 1,
      resulting_status: 'WARNING',
      created_at: new Date(now.getTime() - 4 * 60000).toISOString(),
    },
    {
      id: 'vio-002',
      session_id: 'ses-003',
      exam_id: 'exm-002',
      student_id: 'stu-004',
      event_type: 'tab_switch',
      detail: 'Peserta berpindah tab browser',
      violation_number: 1,
      resulting_status: 'WARNING',
      created_at: new Date(now.getTime() - 12 * 60000).toISOString(),
    },
    {
      id: 'vio-003',
      session_id: 'ses-003',
      exam_id: 'exm-002',
      student_id: 'stu-004',
      event_type: 'window_blur',
      detail: 'Jendela ujian kehilangan fokus',
      violation_number: 2,
      resulting_status: 'WARNING',
      created_at: new Date(now.getTime() - 6 * 60000).toISOString(),
    },
    {
      id: 'vio-004',
      session_id: 'ses-003',
      exam_id: 'exm-002',
      student_id: 'stu-004',
      event_type: 'fullscreen_exit',
      detail: 'Keluar dari mode layar penuh (pelanggaran ke-3 — sesi terkunci)',
      violation_number: 3,
      resulting_status: 'LOCKED',
      created_at: new Date(now.getTime() - 1 * 60000).toISOString(),
    },
  ];

  const activity_logs: ActivityLog[] = [
    {
      id: 'act-001',
      session_id: 'ses-003',
      exam_id: 'exm-002',
      student_id: 'stu-004',
      actor_name: 'Citra Dewi Lestari',
      actor_role: 'SISWA',
      activity: 'Sesi dikunci otomatis karena mencapai 3 pelanggaran (fullscreen_exit)',
      created_at: new Date(now.getTime() - 1 * 60000).toISOString(),
    },
    {
      id: 'act-002',
      session_id: 'ses-002',
      exam_id: 'exm-001',
      student_id: 'stu-003',
      actor_name: 'Bagus Setiawan',
      actor_role: 'SISWA',
      activity: 'Menerima Peringatan 1 akibat perpindahan tab browser',
      created_at: new Date(now.getTime() - 4 * 60000).toISOString(),
    },
    {
      id: 'act-003',
      session_id: 'ses-004',
      exam_id: 'exm-002',
      student_id: 'stu-005',
      actor_name: 'Dimas Arya Saputra',
      actor_role: 'SISWA',
      activity: 'Menyelesaikan ujian Administrasi Jaringan',
      created_at: new Date(now.getTime() - 5 * 60000).toISOString(),
    },
  ];

  const audit_logs: AuditLog[] = [
    {
      id: 'aud-001',
      action: 'lock',
      actor_name: 'Sistem Monitoring SMESA',
      actor_role: 'SYSTEM',
      target_id: 'ses-003',
      summary: 'Sesi Citra Dewi Lestari (2024004) dikunci otomatis pada pelanggaran ke-3',
      created_at: new Date(now.getTime() - 1 * 60000).toISOString(),
    },
    {
      id: 'aud-002',
      action: 'warning',
      actor_name: 'Sistem Monitoring SMESA',
      actor_role: 'SYSTEM',
      target_id: 'ses-002',
      summary: 'Peringatan 1 diterbitkan untuk Bagus Setiawan (2024003)',
      created_at: new Date(now.getTime() - 4 * 60000).toISOString(),
    },
    {
      id: 'aud-003',
      action: 'generate_token',
      actor_name: 'Administrator SMESA',
      actor_role: 'ADMIN',
      target_id: 'tok-001',
      summary: 'Token ujian SMS-RPL201 diterbitkan untuk PAS Pemrograman Web',
      created_at: nowIso,
    },
  ];

  return {
    initialized_auth: false,
    staff_users: [],
    majors,
    students,
    exams,
    tokens,
    exam_sessions,
    violations,
    activity_logs,
    audit_logs,
    sheet_sync: {
      web_app_url: process.env.GOOGLE_APPS_SCRIPT_URL?.trim() || '',
      sync_secret: process.env.GOOGLE_SHEET_SYNC_SECRET?.trim() || '',
      auto_sync_enabled: false,
      auto_sync_interval_sec: 60,
      auto_push_on_change: true,
      last_sync_at: null,
      last_sync_status: 'IDLE',
      last_sync_message: 'Belum dihubungkan ke Google Apps Script.',
      history: [],
    },
  };
}

class SmesaStore {
  private db: PersistedDatabase;
  private onMutationCallbacks: Array<() => void> = [];

  constructor() {
    this.db = this.load();
    this.applyEnvStaffPasscodes();
  }

  private load(): PersistedDatabase {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as PersistedDatabase;
        if (parsed && Array.isArray(parsed.students) && Array.isArray(parsed.exams)) {
          if (!Array.isArray(parsed.majors)) {
            parsed.majors = createDefaultMajors(new Date().toISOString());
            this.persist(parsed);
          }
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load smesa-db.json, creating fresh state:', err);
    }
    const seed = createInitialSeed();
    this.persist(seed);
    return seed;
  }

  private applyEnvStaffPasscodes() {
    const envAdmin = process.env.ADMIN_PASSWORD?.trim();
    const envPengawas = process.env.PENGAWAS_PASSWORD?.trim();
    const nowIso = new Date().toISOString();

    if (envAdmin) {
      this.db.initialized_auth = true;
      const existingAdmin = this.db.staff_users.find((u) => u.username === 'admin');
      if (existingAdmin) {
        existingAdmin.password_hash = hashPassword(envAdmin);
        existingAdmin.active = true;
      } else {
        this.db.staff_users.push({
          id: 'stf-admin',
          username: 'admin',
          full_name: 'Administrator SMESA',
          role: 'ADMIN',
          assigned_classes: [],
          active: true,
          password_hash: hashPassword(envAdmin),
          created_at: nowIso,
        });
      }
    }

    if (envPengawas) {
      const existingProctor = this.db.staff_users.find((u) => u.username === 'pengawas');
      if (existingProctor) {
        existingProctor.password_hash = hashPassword(envPengawas);
        existingProctor.active = true;
      } else {
        this.db.staff_users.push({
          id: 'stf-pengawas',
          username: 'pengawas',
          full_name: 'Pengawas Ujian SMESA',
          role: 'PENGAWAS',
          assigned_classes: [],
          active: true,
          password_hash: hashPassword(envPengawas),
          created_at: nowIso,
        });
      }
    }

    if (envAdmin || envPengawas) {
      this.persist(this.db);
    }
  }

  public onMutation(cb: () => void) {
    this.onMutationCallbacks.push(cb);
  }

  public save(triggerAutoSync = true) {
    this.persist(this.db);
    if (triggerAutoSync) {
      for (const cb of this.onMutationCallbacks) {
        cb();
      }
    }
  }

  private persist(data: PersistedDatabase) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('Failed to persist smesa-db.json:', err);
    }
  }

  public getState(): PersistedDatabase {
    return this.db;
  }

  public needsAuthBootstrap(): boolean {
    if (process.env.ADMIN_PASSWORD?.trim()) return false;
    return !this.db.initialized_auth || this.db.staff_users.filter((u) => u.role === 'ADMIN').length === 0;
  }

  public bootstrapAuth(adminName: string, adminPassword: string, pengawasName: string, pengawasPassword: string) {
    if (!this.needsAuthBootstrap()) {
      throw new Error('Akun Admin sudah diaktifkan sebelumnya.');
    }
    const nowIso = new Date().toISOString();
    this.db.staff_users = [
      {
        id: 'stf-admin',
        username: 'admin',
        full_name: adminName.trim() || 'Administrator SMESA',
        role: 'ADMIN',
        assigned_classes: [],
        active: true,
        password_hash: hashPassword(adminPassword),
        created_at: nowIso,
      },
      {
        id: 'stf-pengawas',
        username: 'pengawas',
        full_name: pengawasName.trim() || 'Pengawas Ruang Ujian',
        role: 'PENGAWAS',
        assigned_classes: [],
        active: true,
        password_hash: hashPassword(pengawasPassword),
        created_at: nowIso,
      },
    ];
    this.db.initialized_auth = true;
    this.addAudit('staff_upsert', adminName.trim() || 'Administrator SMESA', 'ADMIN', 'stf-admin', 'Aktivasi akun Admin & Pengawas pertama kali');
    this.save(false);
  }

  public addActivity(
    actorName: string,
    actorRole: UserRole | 'SYSTEM',
    activity: string,
    refs?: { session_id?: string | null; exam_id?: string | null; student_id?: string | null }
  ): ActivityLog {
    const item: ActivityLog = {
      id: `act-${crypto.randomUUID().slice(0, 8)}`,
      session_id: refs?.session_id ?? null,
      exam_id: refs?.exam_id ?? null,
      student_id: refs?.student_id ?? null,
      actor_name: actorName,
      actor_role: actorRole,
      activity,
      created_at: new Date().toISOString(),
    };
    this.db.activity_logs.unshift(item);
    if (this.db.activity_logs.length > 500) {
      this.db.activity_logs = this.db.activity_logs.slice(0, 500);
    }
    return item;
  }

  public addAudit(
    action: AuditAction,
    actorName: string,
    actorRole: UserRole | 'SYSTEM',
    targetId: string | null,
    summary: string,
    metadata?: Record<string, string | number | boolean | null>
  ): AuditLog {
    const item: AuditLog = {
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      action,
      actor_name: actorName,
      actor_role: actorRole,
      target_id: targetId,
      summary,
      metadata,
      created_at: new Date().toISOString(),
    };
    this.db.audit_logs.unshift(item);
    if (this.db.audit_logs.length > 1000) {
      this.db.audit_logs = this.db.audit_logs.slice(0, 1000);
    }
    return item;
  }

  public refreshExpiredTokens() {
    const nowMs = Date.now();
    let changed = false;
    for (const token of this.db.tokens) {
      if (token.status === 'ACTIVE' && new Date(token.expires_at).getTime() <= nowMs) {
        token.status = 'EXPIRED';
        changed = true;
      }
    }
    if (changed) {
      this.persist(this.db);
    }
  }

  public buildSnapshot(staff?: StaffUser): DashboardSnapshot {
    this.refreshExpiredTokens();
    const assignedClasses = staff && staff.role === 'PENGAWAS' ? staff.assigned_classes : [];
    const filterByClass = assignedClasses.length > 0;

    const students = filterByClass
      ? this.db.students.filter((s) => assignedClasses.includes(s.kelas))
      : [...this.db.students];
    const studentMap = new Map(this.db.students.map((s) => [s.id, s]));
    const allowedStudentIds = new Set(students.map((s) => s.id));

    const exams = filterByClass
      ? this.db.exams.filter((e) => assignedClasses.includes(e.kelas) || e.kelas === 'SEMUA')
      : [...this.db.exams];
    const examMap = new Map(this.db.exams.map((e) => [e.id, e]));
    const tokenMap = new Map(this.db.tokens.map((t) => [t.id, t]));

    const rawSessions = filterByClass
      ? this.db.exam_sessions.filter((s) => allowedStudentIds.has(s.student_id))
      : [...this.db.exam_sessions];

    const sessions: EnrichedSession[] = rawSessions
      .map((s) => {
        const stu = studentMap.get(s.student_id);
        const exm = examMap.get(s.exam_id);
        const tok = s.current_token_id ? tokenMap.get(s.current_token_id) : null;
        return {
          ...s,
          student_nis: stu?.nis || '-',
          student_nama: stu?.nama || 'Siswa Terhapus',
          student_kelas: stu?.kelas || '-',
          student_jurusan: stu?.jurusan || '-',
          exam_nama: exm?.nama_ujian || 'Ujian',
          exam_mapel: exm?.mata_pelajaran || '-',
          current_token_code: tok?.code || null,
        };
      })
      .sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());

    const rawViolations = filterByClass
      ? this.db.violations.filter((v) => allowedStudentIds.has(v.student_id))
      : [...this.db.violations];

    const violations: EnrichedViolation[] = rawViolations
      .map((v) => {
        const stu = studentMap.get(v.student_id);
        const exm = examMap.get(v.exam_id);
        return {
          ...v,
          student_nis: stu?.nis || '-',
          student_nama: stu?.nama || '-',
          student_kelas: stu?.kelas || '-',
          exam_nama: exm?.nama_ujian || '-',
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const allowedExamIds = new Set(exams.map((e) => e.id));
    const tokens: EnrichedToken[] = this.db.tokens
      .filter((t) => (!filterByClass ? true : allowedExamIds.has(t.exam_id)))
      .map((t) => {
        const exm = examMap.get(t.exam_id);
        const assignedStu = t.student_id ? studentMap.get(t.student_id) : null;
        const usedStu = t.used_by_student_id ? studentMap.get(t.used_by_student_id) : null;
        return {
          ...t,
          exam_nama: exm?.nama_ujian || '-',
          assigned_student_nama: assignedStu?.nama || null,
          assigned_student_nis: assignedStu?.nis || null,
          used_by_student_nama: usedStu?.nama || null,
          used_by_student_nis: usedStu?.nis || null,
        };
      })
      .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());

    const activeStudentIdsInSessions = new Set(sessions.map((s) => s.student_id));
    const activeStudentsCount = students.filter((s) => s.status === 'AKTIF').length;
    const belumMulaiSessions = sessions.filter((s) => s.status === 'NOT_STARTED').length;
    const studentsWithoutSession = students.filter(
      (s) => s.status === 'AKTIF' && !activeStudentIdsInSessions.has(s.id)
    ).length;

    const stats: DashboardStats = {
      total_peserta: activeStudentsCount,
      belum_mulai: belumMulaiSessions + studentsWithoutSession,
      aktif: sessions.filter((s) => s.status === 'ACTIVE').length,
      warning: sessions.filter((s) => s.status === 'WARNING').length,
      terkunci: sessions.filter((s) => s.status === 'LOCKED').length,
      selesai: sessions.filter((s) => s.status === 'COMPLETED').length,
      jumlah_pelanggaran: violations.length,
    };

    const activities = filterByClass
      ? this.db.activity_logs.filter((a) => !a.student_id || allowedStudentIds.has(a.student_id)).slice(0, 60)
      : this.db.activity_logs.slice(0, 60);

    return {
      stats,
      sessions,
      violations,
      activities,
      majors: [...this.db.majors],
      students,
      exams,
      tokens,
      sheet_sync_summary: {
        configured: Boolean(this.db.sheet_sync.web_app_url),
        auto_sync_enabled: this.db.sheet_sync.auto_sync_enabled,
        last_sync_at: this.db.sheet_sync.last_sync_at,
        last_sync_status: this.db.sheet_sync.last_sync_status,
      },
      server_time: new Date().toISOString(),
    };
  }

  public getPublicSyncConfig(): SheetSyncConfig {
    const cfg = this.db.sheet_sync;
    return {
      web_app_url: cfg.web_app_url,
      has_secret: Boolean(cfg.sync_secret),
      auto_sync_enabled: cfg.auto_sync_enabled,
      auto_sync_interval_sec: cfg.auto_sync_interval_sec,
      auto_push_on_change: cfg.auto_push_on_change,
      last_sync_at: cfg.last_sync_at,
      last_sync_status: cfg.last_sync_status,
      last_sync_message: cfg.last_sync_message,
      history: cfg.history.slice(0, 30),
    };
  }

  public recordViolation(
    sessionId: string,
    eventType: ViolationType,
    detail: string
  ): {
    violation: Violation;
    session: ExamSession;
    warning_level: 1 | 2 | 3;
    modal_title: string;
    modal_message: string;
    locked: boolean;
  } {
    const session = this.db.exam_sessions.find((s) => s.session_id === sessionId);
    if (!session) {
      throw new Error('Sesi ujian tidak ditemukan.');
    }
    const student = this.db.students.find((s) => s.id === session.student_id);
    const studentName = student?.nama || 'Peserta';

    const nowIso = new Date().toISOString();
    const nextCount = session.violation_count + 1;
    let resultingStatus = session.status;
    let warningLevel: 1 | 2 | 3 = 1;
    let modalTitle = 'PERINGATAN 1';
    let modalMessage = 'Anda terdeteksi meninggalkan halaman ujian.\nAktivitas telah dicatat.';
    let locked = false;

    if (nextCount === 1) {
      resultingStatus = 'WARNING';
      warningLevel = 1;
      modalTitle = 'PERINGATAN 1';
      modalMessage = 'Anda terdeteksi meninggalkan halaman ujian.\nAktivitas telah dicatat.';
    } else if (nextCount === 2) {
      resultingStatus = 'WARNING';
      warningLevel = 2;
      modalTitle = 'PERINGATAN 2';
      modalMessage = 'Aktivitas ujian Anda terdeteksi tidak normal.';
    } else {
      resultingStatus = 'LOCKED';
      warningLevel = 3;
      modalTitle = 'UJIAN TERKUNCI';
      modalMessage = 'Silakan hubungi pengawas untuk mendapatkan TOKEN BARU.';
      locked = true;
    }

    session.violation_count = nextCount;
    session.status = resultingStatus;
    if (eventType === 'fullscreen_exit') {
      session.is_fullscreen = false;
    }
    session.last_activity = locked
      ? `Ujian terkunci (pelanggaran ke-${nextCount}: ${eventType})`
      : `Peringatan ${warningLevel} (${eventType})`;
    session.last_activity_at = nowIso;

    // On 3rd violation (LOCKED), invalidate the currently active token automatically!
    if (locked && session.current_token_id) {
      const activeTok = this.db.tokens.find((t) => t.id === session.current_token_id);
      if (activeTok && activeTok.status !== 'INVALID') {
        activeTok.status = 'INVALID';
        activeTok.invalidated_at = nowIso;
      }
    }

    const violation: Violation = {
      id: `vio-${crypto.randomUUID().slice(0, 8)}`,
      session_id: session.session_id,
      exam_id: session.exam_id,
      student_id: session.student_id,
      event_type: eventType,
      detail: detail.slice(0, 240),
      violation_number: nextCount,
      resulting_status: resultingStatus,
      created_at: nowIso,
    };
    this.db.violations.unshift(violation);

    this.addActivity(
      studentName,
      'SISWA',
      locked
        ? `Sesi TERKUNCI otomatis setelah pelanggaran ke-${nextCount} (${eventType})`
        : `Menerima ${modalTitle} — terdeteksi ${eventType}`,
      { session_id: session.session_id, exam_id: session.exam_id, student_id: session.student_id }
    );

    const auditAction: AuditAction =
      eventType === 'fullscreen_exit'
        ? 'keluar_fullscreen'
        : eventType === 'tab_switch' || eventType === 'page_visibility_hidden'
        ? 'tab_switch'
        : eventType === 'window_blur'
        ? 'window_blur'
        : eventType === 'attempt_leave_page'
        ? 'attempt_leave_page'
        : 'session_reconnect';

    this.addAudit(auditAction, studentName, 'SISWA', session.session_id, `${eventType}: ${detail}`, {
      violation_count: nextCount,
      resulting_status: resultingStatus,
    });

    this.addAudit(
      locked ? 'lock' : 'warning',
      'Sistem Monitoring SMESA',
      'SYSTEM',
      session.session_id,
      locked
        ? `Sesi ${studentName} (${student?.nis || '-'}) dikunci & token diinvalidasi`
        : `${modalTitle} diterbitkan untuk ${studentName} (${student?.nis || '-'})`,
      { violation_count: nextCount }
    );

    this.save();

    return {
      violation,
      session: { ...session },
      warning_level: warningLevel,
      modal_title: modalTitle,
      modal_message: modalMessage,
      locked,
    };
  }
}

export const store = new SmesaStore();
