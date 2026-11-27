import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { StaffUser, ViolationType } from './src/types.ts';
import {
  generateUniqueTokenCode,
  hashPassword,
  signBearerToken,
  store,
  validateGoogleFormUrl,
  verifyBearerToken,
  verifyPassword,
  type BearerPayload,
} from './server/store.ts';
import { sheetSyncService, validateAppsScriptUrl } from './server/googleSheetSync.ts';

interface AuthRequest extends Request {
  auth?: BearerPayload;
  staff?: StaffUser;
}

const VALID_VIOLATION_TYPES: ReadonlySet<ViolationType> = new Set([
  'tab_switch',
  'window_blur',
  'fullscreen_exit',
  'page_visibility_hidden',
  'attempt_leave_page',
  'session_reconnect',
]);

function extractBearer(req: Request): BearerPayload | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return verifyBearerToken(header.slice(7).trim());
}

function requireStaff(allowedRoles: Array<'ADMIN' | 'PENGAWAS'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const payload = extractBearer(req);
    if (!payload || (payload.role !== 'ADMIN' && payload.role !== 'PENGAWAS')) {
      return res.status(401).json({ error: 'Sesi login tidak valid atau telah berakhir.' });
    }
    const found = store.getState().staff_users.find((u) => u.id === payload.sub && u.active);
    if (!found || !allowedRoles.includes(found.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk fitur ini.' });
    }
    req.auth = payload;
    req.staff = {
      id: found.id,
      username: found.username,
      full_name: found.full_name,
      role: found.role,
      assigned_classes: found.assigned_classes,
      active: found.active,
      created_at: found.created_at,
    };
    next();
  };
}

function requireStudent(req: AuthRequest, res: Response, next: NextFunction) {
  const payload = extractBearer(req);
  if (!payload || payload.role !== 'SISWA' || !payload.session_id) {
    return res.status(401).json({ error: 'Sesi ujian siswa tidak valid.' });
  }
  req.auth = payload;
  next();
}

interface ConnectedSocket {
  ws: WebSocket;
  role: 'ADMIN' | 'PENGAWAS' | 'SISWA';
  staffId?: string;
  sessionId?: string;
}

async function createAppServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set<ConnectedSocket>();

  function broadcastDashboardUpdate(eventName: string, alert?: { severity: 'info' | 'warning' | 'danger'; message: string }) {
    const state = store.getState();
    for (const client of clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (client.role === 'ADMIN' || client.role === 'PENGAWAS') {
        const staff = state.staff_users.find((u) => u.id === client.staffId);
        const snapshot = store.buildSnapshot(staff);
        client.ws.send(
          JSON.stringify({
            type: 'dashboard:update',
            event: eventName,
            alert: alert ?? null,
            snapshot,
          })
        );
      }
    }
  }

  function notifyStudentSession(sessionId: string, payload: Record<string, unknown>) {
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN && client.role === 'SISWA' && client.sessionId === sessionId) {
        client.ws.send(JSON.stringify(payload));
      }
    }
  }

  wss.on('connection', (ws) => {
    let registered: ConnectedSocket | null = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type?: string; token?: string };
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          const decoded = verifyBearerToken(msg.token);
          if (!decoded) {
            ws.send(JSON.stringify({ type: 'auth:error', error: 'Token sesi tidak valid.' }));
            return;
          }
          if (registered) {
            clients.delete(registered);
          }
          if (decoded.role === 'ADMIN' || decoded.role === 'PENGAWAS') {
            const staff = store.getState().staff_users.find((u) => u.id === decoded.sub && u.active);
            if (!staff) {
              ws.send(JSON.stringify({ type: 'auth:error', error: 'Akun staff tidak aktif.' }));
              return;
            }
            registered = { ws, role: staff.role, staffId: staff.id };
            clients.add(registered);
            ws.send(
              JSON.stringify({
                type: 'dashboard:init',
                snapshot: store.buildSnapshot(staff),
              })
            );
          } else if (decoded.role === 'SISWA' && decoded.session_id) {
            registered = { ws, role: 'SISWA', sessionId: decoded.session_id };
            clients.add(registered);
            const session = store.getState().exam_sessions.find((s) => s.session_id === decoded.session_id);
            ws.send(JSON.stringify({ type: 'student:init', session: session ?? null }));
          }
        }
      } catch {
        // Ignore malformed websocket frames
      }
    });

    ws.on('close', () => {
      if (registered) {
        clients.delete(registered);
      }
    });
  });

  // Start Google Sheet Auto-Sync Scheduler
  sheetSyncService.start(() => {
    broadcastDashboardUpdate('sheet:synced');
  });

  // =========================================================================
  // AUTH ROUTES (ADMIN & PENGAWAS)
  // =========================================================================

  app.get('/api/auth/status', (_req, res) => {
    res.json({
      needs_bootstrap: store.needsAuthBootstrap(),
      env_managed: Boolean(process.env.ADMIN_PASSWORD?.trim()),
    });
  });

  app.post('/api/auth/bootstrap', (req, res) => {
    try {
      if (!store.needsAuthBootstrap()) {
        return res.status(409).json({ error: 'Akun Admin sudah diaktifkan sebelumnya.' });
      }
      const { admin_name, admin_password, pengawas_name, pengawas_password } = req.body ?? {};
      if (typeof admin_password !== 'string' || admin_password.trim().length < 6) {
        return res.status(400).json({ error: 'Kata sandi Admin minimal 6 karakter.' });
      }
      if (typeof pengawas_password !== 'string' || pengawas_password.trim().length < 6) {
        return res.status(400).json({ error: 'Kata sandi Pengawas minimal 6 karakter.' });
      }

      store.bootstrapAuth(
        String(admin_name || 'Administrator SMESA'),
        admin_password.trim(),
        String(pengawas_name || 'Pengawas Ujian SMESA'),
        pengawas_password.trim()
      );

      const adminUser = store.getState().staff_users.find((u) => u.username === 'admin')!;
      const token = signBearerToken({ sub: adminUser.id, role: adminUser.role, name: adminUser.full_name });
      res.json({
        token,
        user: {
          id: adminUser.id,
          username: adminUser.username,
          full_name: adminUser.full_name,
          role: adminUser.role,
          assigned_classes: adminUser.assigned_classes,
          active: adminUser.active,
          created_at: adminUser.created_at,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal aktivasi akun.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
    }
    const cleanUser = username.trim().toLowerCase();
    const found = store.getState().staff_users.find((u) => u.username.toLowerCase() === cleanUser);
    if (!found || !found.active || !verifyPassword(password, found.password_hash)) {
      return res.status(401).json({ error: 'Username atau kata sandi salah, atau akun tidak aktif.' });
    }

    const token = signBearerToken({ sub: found.id, role: found.role, name: found.full_name });
    store.addAudit('login', found.full_name, found.role, found.id, `${found.role} (${found.username}) berhasil masuk`);
    store.addActivity(found.full_name, found.role, `Masuk ke Dashboard ${found.role === 'ADMIN' ? 'Admin' : 'Pengawas'}`);
    store.save(false);
    broadcastDashboardUpdate('staff:login');

    res.json({
      token,
      user: {
        id: found.id,
        username: found.username,
        full_name: found.full_name,
        role: found.role,
        assigned_classes: found.assigned_classes,
        active: found.active,
        created_at: found.created_at,
      },
    });
  });

  app.get('/api/auth/me', requireStaff(['ADMIN', 'PENGAWAS']), (req: AuthRequest, res) => {
    res.json({ user: req.staff });
  });

  app.post('/api/auth/logout', requireStaff(['ADMIN', 'PENGAWAS']), (req: AuthRequest, res) => {
    if (req.staff) {
      store.addAudit('logout', req.staff.full_name, req.staff.role, req.staff.id, `${req.staff.role} keluar dari sistem`);
      store.save(false);
    }
    res.json({ ok: true });
  });

  // =========================================================================
  // STUDENT GATE & EXAM MONITORING ROUTES (SERVER-AUTHORITATIVE)
  // =========================================================================

  app.get('/api/public/exams', (_req, res) => {
    const activeExams = store
      .getState()
      .exams.filter((e) => e.status === 'AKTIF' || e.status === 'TERJADWAL')
      .map((e) => ({
        id: e.id,
        nama_ujian: e.nama_ujian,
        mata_pelajaran: e.mata_pelajaran,
        kelas: e.kelas,
        tanggal: e.tanggal,
        jam_mulai: e.jam_mulai,
        jam_selesai: e.jam_selesai,
        durasi: e.durasi,
        status: e.status,
      }));
    res.json({ exams: activeExams, server_time: new Date().toISOString() });
  });

  app.post('/api/student/validate-token', (req, res) => {
    store.refreshExpiredTokens();
    const { nis, token_code } = req.body ?? {};
    const cleanNis = String(nis ?? '').trim();
    const cleanCode = String(token_code ?? '').trim().toUpperCase();

    if (!cleanNis || !cleanCode) {
      return res.status(400).json({ error: 'NIS dan Token Ujian wajib diisi.' });
    }

    const state = store.getState();
    const student = state.students.find((s) => s.nis === cleanNis);
    if (!student) {
      return res.status(404).json({ error: 'NIS tidak terdaftar dalam Master Data Siswa SMK Negeri 1 Jember.' });
    }
    if (student.status !== 'AKTIF') {
      return res.status(403).json({ error: 'Status siswa tidak aktif. Hubungi panitia/admin ujian.' });
    }

    const token = state.tokens.find((t) => t.code.toUpperCase() === cleanCode);
    if (!token) {
      return res.status(404).json({ error: 'Token tidak dikenali. Periksa kembali penulisan token.' });
    }
    if (token.status === 'INVALID') {
      return res.status(403).json({ error: 'Token ini sudah dibatalkan / tidak berlaku.' });
    }
    if (token.status === 'EXPIRED' || new Date(token.expires_at).getTime() <= Date.now()) {
      token.status = 'EXPIRED';
      store.save(false);
      return res.status(403).json({ error: 'Masa berlaku token telah habis. Minta token baru ke pengawas.' });
    }

    // Strict ownership & anti-sharing enforcement
    if (token.student_id && token.student_id !== student.id) {
      return res.status(403).json({ error: 'Token khusus ini diterbitkan untuk peserta lain dan tidak dapat digunakan.' });
    }
    if (token.used_by_student_id && token.used_by_student_id !== student.id) {
      return res.status(403).json({ error: 'Token sudah dipakai oleh siswa lain. Satu token hanya untuk satu peserta.' });
    }

    const exam = state.exams.find((e) => e.id === token.exam_id);
    if (!exam) {
      return res.status(404).json({ error: 'Data ujian untuk token ini tidak ditemukan.' });
    }
    if (exam.status !== 'AKTIF') {
      return res.status(403).json({ error: `Ujian "${exam.nama_ujian}" saat ini berstatus ${exam.status} (belum dibuka).` });
    }

    const nowIso = new Date().toISOString();
    let session = state.exam_sessions.find((s) => s.exam_id === exam.id && s.student_id === student.id);

    if (session) {
      if (session.status === 'COMPLETED') {
        return res.status(403).json({ error: 'Anda sudah menyelesaikan ujian ini.' });
      }
      if (session.status === 'LOCKED' && !token.is_unlock_token) {
        return res.status(423).json({
          error: 'Sesi ujian Anda sedang TERKUNCI. Hubungi pengawas untuk mendapatkan TOKEN BARU khusus.',
          locked: true,
        });
      }

      if (token.is_unlock_token) {
        session.status = 'ACTIVE';
        session.violation_count = 0;
        session.current_token_id = token.id;
        session.last_activity = `Sesi dibuka kembali menggunakan token baru (${token.code})`;
        session.last_activity_at = nowIso;
        token.status = 'USED';
        token.used_by_student_id = student.id;
      } else {
        // Reconnecting with their own previously bound token
        if (token.status === 'ACTIVE') {
          token.status = 'USED';
          token.used_by_student_id = student.id;
        }
        session.current_token_id = token.id;
        session.last_activity = 'Peserta tersambung kembali ke halaman ujian';
        session.last_activity_at = nowIso;
      }
    } else {
      token.status = 'USED';
      token.used_by_student_id = student.id;
      session = {
        session_id: `ses-${crypto.randomUUID().slice(0, 8)}`,
        exam_id: exam.id,
        student_id: student.id,
        started_at: nowIso,
        ended_at: null,
        status: 'NOT_STARTED',
        violation_count: 0,
        current_token_id: token.id,
        last_activity: 'Validasi token berhasil — membaca petunjuk ujian',
        last_activity_at: nowIso,
        unlocked_count: 0,
        is_fullscreen: false,
      };
      state.exam_sessions.unshift(session);
    }

    store.addActivity(
      student.nama,
      'SISWA',
      token.is_unlock_token
        ? `Berhasil membuka kunci ujian dengan token baru (${token.code})`
        : `Validasi token berhasil untuk ${exam.nama_ujian}`,
      { session_id: session.session_id, exam_id: exam.id, student_id: student.id }
    );
    store.addAudit(
      'validasi_token',
      student.nama,
      'SISWA',
      session.session_id,
      `Validasi token ${token.code} untuk NIS ${student.nis} (${exam.nama_ujian})`
    );
    store.save();

    const bearer = signBearerToken({
      sub: student.id,
      role: 'SISWA',
      name: student.nama,
      session_id: session.session_id,
      exam_id: exam.id,
    });

    broadcastDashboardUpdate('student:validated', {
      severity: 'info',
      message: `${student.nama} (${student.kelas}) memvalidasi token ujian.`,
    });

    res.json({
      token: bearer,
      session,
      student,
      exam,
      active_token_code: token.code,
    });
  });

  app.get('/api/student/session', requireStudent, (req: AuthRequest, res) => {
    const state = store.getState();
    const session = state.exam_sessions.find(
      (s) => s.session_id === req.auth?.session_id && s.student_id === req.auth?.sub
    );
    if (!session) {
      return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    }
    const exam = state.exams.find((e) => e.id === session.exam_id);
    const student = state.students.find((s) => s.id === session.student_id);
    res.json({ session, exam, student, server_time: new Date().toISOString() });
  });

  app.post('/api/student/fullscreen', requireStudent, (req: AuthRequest, res) => {
    const state = store.getState();
    const session = state.exam_sessions.find(
      (s) => s.session_id === req.auth?.session_id && s.student_id === req.auth?.sub
    );
    if (!session) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    if (session.status === 'LOCKED') {
      return res.status(423).json({ error: 'Sesi terkunci. Hubungi pengawas untuk mendapatkan TOKEN BARU.' });
    }

    const nowIso = new Date().toISOString();
    const wasNotStarted = session.status === 'NOT_STARTED';
    if (!session.started_at) session.started_at = nowIso;
    if (session.status === 'NOT_STARTED') session.status = 'ACTIVE';
    session.is_fullscreen = true;
    session.last_activity = wasNotStarted
      ? 'Fullscreen aktif — mulai mengerjakan Google Form'
      : 'Kembali ke mode Fullscreen';
    session.last_activity_at = nowIso;

    const student = state.students.find((s) => s.id === session.student_id);
    const actorName = student?.nama || req.auth?.name || 'Siswa';

    store.addActivity(actorName, 'SISWA', session.last_activity, {
      session_id: session.session_id,
      exam_id: session.exam_id,
      student_id: session.student_id,
    });
    if (wasNotStarted) {
      store.addAudit('mulai_ujian', actorName, 'SISWA', session.session_id, 'Peserta mulai mengerjakan soal ujian');
    }
    store.addAudit('fullscreen', actorName, 'SISWA', session.session_id, 'Mode Fullscreen diaktifkan');
    store.save();

    broadcastDashboardUpdate('student:fullscreen');
    res.json({ session });
  });

  app.post('/api/student/violation', requireStudent, (req: AuthRequest, res) => {
    const { event_type, detail } = req.body ?? {};
    if (!VALID_VIOLATION_TYPES.has(event_type)) {
      return res.status(400).json({ error: 'Jenis event pelanggaran tidak valid.' });
    }

    const state = store.getState();
    const session = state.exam_sessions.find(
      (s) => s.session_id === req.auth?.session_id && s.student_id === req.auth?.sub
    );
    if (!session) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    if (session.status === 'COMPLETED') {
      return res.json({ ignored: true, session });
    }
    if (session.status === 'LOCKED') {
      return res.json({
        session,
        warning_level: 3,
        modal_title: 'UJIAN TERKUNCI',
        modal_message: 'Silakan hubungi pengawas untuk mendapatkan TOKEN BARU.',
        locked: true,
      });
    }

    const result = store.recordViolation(
      session.session_id,
      event_type as ViolationType,
      typeof detail === 'string' && detail.trim() ? detail.trim() : `Event ${event_type} terdeteksi oleh browser`
    );

    const student = state.students.find((s) => s.id === session.student_id);
    broadcastDashboardUpdate('student:violation', {
      severity: result.locked ? 'danger' : 'warning',
      message: result.locked
        ? `TERKUNCI: ${student?.nama || 'Peserta'} (${student?.kelas || '-'}) mencapai pelanggaran ke-${result.session.violation_count}.`
        : `PERINGATAN ${result.warning_level}: ${student?.nama || 'Peserta'} (${event_type}).`,
    });

    res.json(result);
  });

  app.post('/api/student/unlock-resume', requireStudent, (req: AuthRequest, res) => {
    store.refreshExpiredTokens();
    const { token_code } = req.body ?? {};
    const cleanCode = String(token_code ?? '').trim().toUpperCase();
    if (!cleanCode) {
      return res.status(400).json({ error: 'Masukkan TOKEN BARU yang diberikan oleh pengawas.' });
    }

    const state = store.getState();
    const session = state.exam_sessions.find(
      (s) => s.session_id === req.auth?.session_id && s.student_id === req.auth?.sub
    );
    if (!session) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });

    const token = state.tokens.find((t) => t.code.toUpperCase() === cleanCode);
    if (!token) return res.status(404).json({ error: 'Token baru tidak ditemukan.' });
    if (token.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Token ini sudah digunakan, dibatalkan, atau kedaluwarsa.' });
    }
    if (new Date(token.expires_at).getTime() <= Date.now()) {
      token.status = 'EXPIRED';
      store.save(false);
      return res.status(403).json({ error: 'Masa berlaku token baru telah habis.' });
    }
    if (!token.is_unlock_token || token.student_id !== session.student_id || token.exam_id !== session.exam_id) {
      return res.status(403).json({ error: 'Token ini bukan token buka kunci yang diterbitkan khusus untuk akun Anda.' });
    }

    const nowIso = new Date().toISOString();
    token.status = 'USED';
    token.used_by_student_id = session.student_id;

    session.status = 'ACTIVE';
    session.violation_count = 0;
    session.current_token_id = token.id;
    session.last_activity = `Sesi dibuka kembali menggunakan token baru (${token.code})`;
    session.last_activity_at = nowIso;

    const student = state.students.find((s) => s.id === session.student_id);
    store.addActivity(
      student?.nama || 'Peserta',
      'SISWA',
      `Berhasil membuka kunci ujian dengan token baru ${token.code}`,
      { session_id: session.session_id, exam_id: session.exam_id, student_id: session.student_id }
    );
    store.addAudit(
      'validasi_token',
      student?.nama || 'Peserta',
      'SISWA',
      session.session_id,
      `Peserta membuka kunci sesi dengan token baru ${token.code}`
    );
    store.save();

    broadcastDashboardUpdate('student:unlocked', {
      severity: 'info',
      message: `${student?.nama || 'Peserta'} berhasil masuk kembali dengan token baru.`,
    });

    res.json({ session, active_token_code: token.code });
  });

  app.post('/api/student/complete', requireStudent, (req: AuthRequest, res) => {
    const state = store.getState();
    const session = state.exam_sessions.find(
      (s) => s.session_id === req.auth?.session_id && s.student_id === req.auth?.sub
    );
    if (!session) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    if (session.status === 'LOCKED') {
      return res.status(423).json({ error: 'Sesi sedang terkunci. Hubungi pengawas terlebih dahulu.' });
    }

    const nowIso = new Date().toISOString();
    session.status = 'COMPLETED';
    session.ended_at = nowIso;
    session.is_fullscreen = false;
    session.last_activity = 'Menyelesaikan ujian';
    session.last_activity_at = nowIso;

    const student = state.students.find((s) => s.id === session.student_id);
    store.addActivity(student?.nama || 'Peserta', 'SISWA', 'Menyelesaikan ujian', {
      session_id: session.session_id,
      exam_id: session.exam_id,
      student_id: session.student_id,
    });
    store.addAudit('selesai_ujian', student?.nama || 'Peserta', 'SISWA', session.session_id, 'Peserta menyelesaikan ujian');
    store.save();

    broadcastDashboardUpdate('student:completed', {
      severity: 'info',
      message: `${student?.nama || 'Peserta'} (${student?.kelas || '-'}) telah menyelesaikan ujian.`,
    });

    res.json({ session });
  });

  // =========================================================================
  // PENGAWAS & ADMIN SHARED OPERATIONAL ROUTES
  // =========================================================================

  app.get('/api/dashboard/snapshot', requireStaff(['ADMIN', 'PENGAWAS']), (req: AuthRequest, res) => {
    res.json(store.buildSnapshot(req.staff));
  });

  app.get('/api/sessions/:sessionId/detail', requireStaff(['ADMIN', 'PENGAWAS']), (req: AuthRequest, res) => {
    const state = store.getState();
    const session = state.exam_sessions.find((s) => s.session_id === req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Sesi peserta tidak ditemukan.' });

    const student = state.students.find((s) => s.id === session.student_id);
    if (
      req.staff?.role === 'PENGAWAS' &&
      req.staff.assigned_classes.length > 0 &&
      student &&
      !req.staff.assigned_classes.includes(student.kelas)
    ) {
      return res.status(403).json({ error: 'Peserta ini berada di luar kelas pengawasan Anda.' });
    }

    const exam = state.exams.find((e) => e.id === session.exam_id);
    const violations = state.violations
      .filter((v) => v.session_id === session.session_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const activities = state.activity_logs
      .filter((a) => a.session_id === session.session_id)
      .slice(0, 40);
    const tokens = state.tokens
      .filter(
        (t) =>
          t.exam_id === session.exam_id &&
          (t.student_id === session.student_id || t.used_by_student_id === session.student_id || t.id === session.current_token_id)
      )
      .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());

    res.json({ session, student, exam, violations, activities, tokens });
  });

  app.post('/api/sessions/:sessionId/unlock', requireStaff(['ADMIN', 'PENGAWAS']), (req: AuthRequest, res) => {
    const state = store.getState();
    const session = state.exam_sessions.find((s) => s.session_id === req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Sesi peserta tidak ditemukan.' });

    const student = state.students.find((s) => s.id === session.student_id);
    if (!student) return res.status(404).json({ error: 'Data siswa tidak ditemukan.' });

    if (
      req.staff?.role === 'PENGAWAS' &&
      req.staff.assigned_classes.length > 0 &&
      !req.staff.assigned_classes.includes(student.kelas)
    ) {
      return res.status(403).json({ error: 'Anda tidak berwenang membuka kunci peserta di luar kelas pengawasan.' });
    }

    const expiryMinutes = Math.min(240, Math.max(5, Number(req.body?.expiry_minutes) || 30));
    const nowIso = new Date().toISOString();

    // Invalidate previous active token(s) for this session/student on this exam
    for (const tok of state.tokens) {
      if (
        tok.id === session.current_token_id ||
        (tok.exam_id === session.exam_id && tok.student_id === student.id && tok.status === 'ACTIVE')
      ) {
        tok.status = 'INVALID';
        tok.invalidated_at = nowIso;
      }
    }

    // Generate unique personal unlock token
    let code = generateUniqueTokenCode('UNLK');
    while (state.tokens.some((t) => t.code === code)) {
      code = generateUniqueTokenCode('UNLK');
    }

    const newToken = {
      id: `tok-${crypto.randomUUID().slice(0, 8)}`,
      code,
      exam_id: session.exam_id,
      student_id: student.id, // STRICTLY bound to this student only
      used_by_student_id: null,
      status: 'ACTIVE' as const,
      is_unlock_token: true,
      expires_at: new Date(Date.now() + expiryMinutes * 60000).toISOString(),
      issued_by: req.staff!.full_name,
      issued_by_role: req.staff!.role,
      issued_at: nowIso,
      invalidated_at: null,
    };
    state.tokens.unshift(newToken);

    session.unlocked_count += 1;
    session.last_activity = `Token baru (${code}) diterbitkan oleh ${req.staff!.full_name}`;
    session.last_activity_at = nowIso;

    store.addActivity(
      req.staff!.full_name,
      req.staff!.role,
      `Membuka kunci & menerbitkan token baru ${code} khusus untuk ${student.nama} (${student.nis})`,
      { session_id: session.session_id, exam_id: session.exam_id, student_id: student.id }
    );
    store.addAudit('unlock', req.staff!.full_name, req.staff!.role, session.session_id, `Buka kunci sesi ${student.nama} (${student.nis})`);
    store.addAudit(
      'token_baru',
      req.staff!.full_name,
      req.staff!.role,
      newToken.id,
      `Token baru ${code} diterbitkan khusus untuk ${student.nama} (${student.nis}), berlaku ${expiryMinutes} menit`,
      { student_nis: student.nis, expiry_minutes: expiryMinutes }
    );
    store.save();

    broadcastDashboardUpdate('session:unlocked', {
      severity: 'info',
      message: `${req.staff!.full_name} menerbitkan token buka kunci untuk ${student.nama}.`,
    });
    notifyStudentSession(session.session_id, {
      type: 'student:unlock_ready',
      message: 'Pengawas telah menerbitkan TOKEN BARU untuk Anda. Silakan masukkan token dari pengawas.',
    });

    res.json({ token: newToken, session });
  });

  app.post('/api/tokens/generate', requireStaff(['ADMIN', 'PENGAWAS']), (req: AuthRequest, res) => {
    const { exam_id, student_id, expiry_minutes, count } = req.body ?? {};
    const state = store.getState();
    const exam = state.exams.find((e) => e.id === exam_id);
    if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan.' });

    const qty = Math.min(50, Math.max(1, Number(count) || 1));
    const expiryMin = Math.min(480, Math.max(5, Number(expiry_minutes) || 120));
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + expiryMin * 60000).toISOString();

    let targetStudentId: string | null = null;
    if (student_id) {
      const stu = state.students.find((s) => s.id === student_id);
      if (!stu) return res.status(404).json({ error: 'Siswa tujuan tidak ditemukan.' });
      targetStudentId = stu.id;
    }

    const created = [];
    for (let i = 0; i < (targetStudentId ? 1 : qty); i++) {
      let code = generateUniqueTokenCode('SMS');
      while (state.tokens.some((t) => t.code === code)) {
        code = generateUniqueTokenCode('SMS');
      }
      const record = {
        id: `tok-${crypto.randomUUID().slice(0, 8)}`,
        code,
        exam_id: exam.id,
        student_id: targetStudentId,
        used_by_student_id: null,
        status: 'ACTIVE' as const,
        is_unlock_token: false,
        expires_at: expiresIso,
        issued_by: req.staff!.full_name,
        issued_by_role: req.staff!.role,
        issued_at: nowIso,
        invalidated_at: null,
      };
      state.tokens.unshift(record);
      created.push(record);
    }

    store.addAudit(
      'generate_token',
      req.staff!.full_name,
      req.staff!.role,
      exam.id,
      `Membuat ${created.length} token ujian untuk ${exam.nama_ujian} (berlaku ${expiryMin} menit)`
    );
    store.addActivity(
      req.staff!.full_name,
      req.staff!.role,
      `Menerbitkan ${created.length} token untuk ${exam.nama_ujian}`,
      { exam_id: exam.id }
    );
    store.save();

    broadcastDashboardUpdate('token:generated');
    res.json({ tokens: created });
  });

  app.patch('/api/tokens/:id/status', requireStaff(['ADMIN', 'PENGAWAS']), (req: AuthRequest, res) => {
    const { status } = req.body ?? {};
    if (status !== 'ACTIVE' && status !== 'INVALID') {
      return res.status(400).json({ error: 'Status token hanya dapat diubah menjadi ACTIVE atau INVALID.' });
    }
    const token = store.getState().tokens.find((t) => t.id === req.params.id);
    if (!token) return res.status(404).json({ error: 'Token tidak ditemukan.' });

    token.status = status;
    token.invalidated_at = status === 'INVALID' ? new Date().toISOString() : null;
    if (status === 'ACTIVE' && new Date(token.expires_at).getTime() <= Date.now()) {
      token.expires_at = new Date(Date.now() + 60 * 60000).toISOString();
    }

    store.addAudit(
      status === 'INVALID' ? 'revoke_token' : 'generate_token',
      req.staff!.full_name,
      req.staff!.role,
      token.id,
      `${status === 'INVALID' ? 'Membatalkan' : 'Mengaktifkan kembali'} token ${token.code}`
    );
    store.save();

    broadcastDashboardUpdate('token:updated');
    res.json({ token });
  });

  app.post('/api/exams', requireStaff(['ADMIN', 'PENGAWAS']), (req: AuthRequest, res) => {
    const { nama_ujian, mata_pelajaran, kelas, tanggal, jam_mulai, jam_selesai, durasi, google_form_url, status } =
      req.body ?? {};
    if (!nama_ujian || !mata_pelajaran || !kelas || !tanggal || !jam_mulai || !jam_selesai || !google_form_url) {
      return res.status(400).json({ error: 'Seluruh field jadwal ujian dan URL Google Form wajib diisi.' });
    }
    const urlCheck = validateGoogleFormUrl(String(google_form_url));
    if (!urlCheck.valid) {
      return res.status(400).json({ error: urlCheck.error });
    }
    const nowIso = new Date().toISOString();
    const exam = {
      id: `exm-${crypto.randomUUID().slice(0, 8)}`,
      nama_ujian: String(nama_ujian).trim(),
      mata_pelajaran: String(mata_pelajaran).trim(),
      kelas: String(kelas).trim(),
      tanggal: String(tanggal).trim(),
      jam_mulai: String(jam_mulai).trim(),
      jam_selesai: String(jam_selesai).trim(),
      durasi: Math.max(10, Number(durasi) || 90),
      google_form_url: urlCheck.normalized,
      status: (['DRAFT', 'TERJADWAL', 'AKTIF', 'SELESAI'].includes(status) ? status : 'TERJADWAL') as
        | 'DRAFT'
        | 'TERJADWAL'
        | 'AKTIF'
        | 'SELESAI',
      created_at: nowIso,
      updated_at: nowIso,
    };

    store.getState().exams.unshift(exam);
    store.addAudit('exam_upsert', req.staff!.full_name, req.staff!.role, exam.id, `Menambahkan ujian "${exam.nama_ujian}"`);
    store.save();

    broadcastDashboardUpdate('exam:created');
    res.status(201).json({ exam });
  });

  app.patch('/api/exams/:id', requireStaff(['ADMIN', 'PENGAWAS']), (req: AuthRequest, res) => {
    const exam = store.getState().exams.find((e) => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Jadwal ujian tidak ditemukan.' });

    const body = req.body ?? {};
    if (body.google_form_url !== undefined) {
      const urlCheck = validateGoogleFormUrl(String(body.google_form_url));
      if (!urlCheck.valid) return res.status(400).json({ error: urlCheck.error });
      exam.google_form_url = urlCheck.normalized;
    }
    if (body.nama_ujian) exam.nama_ujian = String(body.nama_ujian).trim();
    if (body.mata_pelajaran) exam.mata_pelajaran = String(body.mata_pelajaran).trim();
    if (body.kelas) exam.kelas = String(body.kelas).trim();
    if (body.tanggal) exam.tanggal = String(body.tanggal).trim();
    if (body.jam_mulai) exam.jam_mulai = String(body.jam_mulai).trim();
    if (body.jam_selesai) exam.jam_selesai = String(body.jam_selesai).trim();
    if (body.durasi !== undefined) exam.durasi = Math.max(10, Number(body.durasi) || exam.durasi);
    if (['DRAFT', 'TERJADWAL', 'AKTIF', 'SELESAI'].includes(body.status)) {
      exam.status = body.status;
    }
    exam.updated_at = new Date().toISOString();

    store.addAudit('exam_upsert', req.staff!.full_name, req.staff!.role, exam.id, `Memperbarui ujian "${exam.nama_ujian}" (${exam.status})`);
    store.save();

    broadcastDashboardUpdate('exam:updated');
    res.json({ exam });
  });

  app.delete('/api/exams/:id', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const state = store.getState();
    const idx = state.exams.findIndex((e) => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Jadwal ujian tidak ditemukan.' });
    const [removed] = state.exams.splice(idx, 1);
    store.addAudit('exam_upsert', req.staff!.full_name, req.staff!.role, removed.id, `Menghapus jadwal ujian "${removed.nama_ujian}"`);
    store.save();
    broadcastDashboardUpdate('exam:deleted');
    res.json({ ok: true });
  });

  // =========================================================================
  // ADMIN-EXCLUSIVE ROUTES (MASTER INPUT SISWA, SHEET SYNC, STAFF, AUDIT LOG)
  // =========================================================================

  app.post('/api/students', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const { nis, nama, kelas, jurusan, status } = req.body ?? {};
    const cleanNis = String(nis ?? '').trim();
    const cleanNama = String(nama ?? '').trim();
    if (!cleanNis || !cleanNama || !kelas || !jurusan) {
      return res.status(400).json({ error: 'NIS, Nama, Kelas, dan Jurusan wajib diisi.' });
    }
    const state = store.getState();
    if (state.students.some((s) => s.nis === cleanNis)) {
      return res.status(409).json({ error: `NIS ${cleanNis} sudah terdaftar.` });
    }

    const student = {
      id: `stu-${crypto.randomUUID().slice(0, 8)}`,
      nis: cleanNis,
      nama: cleanNama,
      kelas: String(kelas).trim(),
      jurusan: String(jurusan).trim(),
      status: (status === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF') as 'AKTIF' | 'NONAKTIF',
      updated_at: new Date().toISOString(),
    };
    state.students.unshift(student);
    store.addAudit('student_upsert', req.staff!.full_name, req.staff!.role, student.id, `Menambahkan siswa ${student.nama} (${student.nis})`);
    store.save();

    broadcastDashboardUpdate('student:created');
    res.status(201).json({ student });
  });

  app.post('/api/students/bulk', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const rows = Array.isArray(req.body?.students) ? req.body.students : [];
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data siswa yang dikirim untuk impor.' });
    }

    const state = store.getState();
    const nowIso = new Date().toISOString();
    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const nis = String(row.nis ?? '').trim();
      const nama = String(row.nama ?? '').trim();
      if (!nis || !nama) continue;
      const kelas = String(row.kelas ?? 'XII').trim();
      const jurusan = String(row.jurusan ?? '-').trim();
      const status = String(row.status ?? 'AKTIF').toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF';

      const existing = state.students.find((s) => s.nis === nis);
      if (existing) {
        existing.nama = nama;
        existing.kelas = kelas;
        existing.jurusan = jurusan;
        existing.status = status;
        existing.updated_at = nowIso;
        updated++;
      } else {
        state.students.push({
          id: `stu-${crypto.randomUUID().slice(0, 8)}`,
          nis,
          nama,
          kelas,
          jurusan,
          status,
          updated_at: nowIso,
        });
        inserted++;
      }
    }

    store.addAudit(
      'student_bulk_import',
      req.staff!.full_name,
      req.staff!.role,
      null,
      `Impor Master Siswa: ${inserted} baru, ${updated} diperbarui`
    );
    store.save();
    broadcastDashboardUpdate('student:bulk_imported');

    res.json({ inserted, updated, total: inserted + updated });
  });

  app.patch('/api/students/:id', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const state = store.getState();
    const student = state.students.find((s) => s.id === req.params.id);
    if (!student) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });

    const { nis, nama, kelas, jurusan, status } = req.body ?? {};
    if (nis && String(nis).trim() !== student.nis) {
      const cleanNis = String(nis).trim();
      if (state.students.some((s) => s.nis === cleanNis && s.id !== student.id)) {
        return res.status(409).json({ error: `NIS ${cleanNis} sudah digunakan siswa lain.` });
      }
      student.nis = cleanNis;
    }
    if (nama) student.nama = String(nama).trim();
    if (kelas) student.kelas = String(kelas).trim();
    if (jurusan) student.jurusan = String(jurusan).trim();
    if (status === 'AKTIF' || status === 'NONAKTIF') student.status = status;
    student.updated_at = new Date().toISOString();

    store.addAudit('student_upsert', req.staff!.full_name, req.staff!.role, student.id, `Memperbarui siswa ${student.nama} (${student.nis})`);
    store.save();
    broadcastDashboardUpdate('student:updated');
    res.json({ student });
  });

  app.delete('/api/students/:id', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const state = store.getState();
    const idx = state.students.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });
    const [removed] = state.students.splice(idx, 1);
    store.addAudit('student_upsert', req.staff!.full_name, req.staff!.role, removed.id, `Menghapus siswa ${removed.nama} (${removed.nis})`);
    store.save();
    broadcastDashboardUpdate('student:deleted');
    res.json({ ok: true });
  });

  // =========================================================================
  // ADMIN MASTER INPUT JURUSAN ROUTES
  // =========================================================================

  app.post('/api/majors', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const { kode, nama_jurusan, status } = req.body ?? {};
    const cleanKode = String(kode ?? '').trim().toUpperCase();
    const cleanNama = String(nama_jurusan ?? '').trim();
    if (!cleanKode || !cleanNama) {
      return res.status(400).json({ error: 'Kode jurusan dan nama jurusan wajib diisi.' });
    }
    const state = store.getState();
    if (state.majors.some((m) => m.kode.toUpperCase() === cleanKode)) {
      return res.status(409).json({ error: `Kode jurusan "${cleanKode}" sudah terdaftar.` });
    }
    const major = {
      id: `maj-${crypto.randomUUID().slice(0, 8)}`,
      kode: cleanKode,
      nama_jurusan: cleanNama,
      status: (status === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF') as 'AKTIF' | 'NONAKTIF',
      updated_at: new Date().toISOString(),
    };
    state.majors.push(major);
    store.addAudit('major_upsert', req.staff!.full_name, 'ADMIN', major.id, `Menambahkan jurusan ${major.kode} — ${major.nama_jurusan}`);
    store.save(true);
    broadcastDashboardUpdate('major:created');
    res.status(201).json({ major });
  });

  app.post('/api/majors/bulk', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const rows = Array.isArray(req.body?.majors) ? req.body.majors : [];
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data jurusan yang dikirim untuk impor.' });
    }
    const state = store.getState();
    const nowIso = new Date().toISOString();
    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const kode = String(row.kode ?? '').trim().toUpperCase();
      const namaJurusan = String(row.nama_jurusan ?? '').trim();
      if (!kode || !namaJurusan) continue;
      const status = String(row.status ?? 'AKTIF').trim().toUpperCase() === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF';

      const existing = state.majors.find((m) => m.kode.toUpperCase() === kode);
      if (existing) {
        existing.nama_jurusan = namaJurusan;
        existing.status = status;
        existing.updated_at = nowIso;
        updated++;
      } else {
        state.majors.push({
          id: `maj-${crypto.randomUUID().slice(0, 8)}`,
          kode,
          nama_jurusan: namaJurusan,
          status,
          updated_at: nowIso,
        });
        inserted++;
      }
    }

    store.addAudit('major_bulk_import', req.staff!.full_name, 'ADMIN', null, `Impor Master Jurusan: ${inserted} baru, ${updated} diperbarui`);
    store.save(true);
    broadcastDashboardUpdate('major:bulk_imported');
    res.json({ inserted, updated, total: inserted + updated });
  });

  app.patch('/api/majors/:id', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const state = store.getState();
    const major = state.majors.find((m) => m.id === req.params.id);
    if (!major) return res.status(404).json({ error: 'Data jurusan tidak ditemukan.' });

    const { kode, nama_jurusan, status } = req.body ?? {};
    if (kode && String(kode).trim().toUpperCase() !== major.kode) {
      const cleanKode = String(kode).trim().toUpperCase();
      if (state.majors.some((m) => m.kode.toUpperCase() === cleanKode && m.id !== major.id)) {
        return res.status(409).json({ error: `Kode jurusan "${cleanKode}" sudah digunakan.` });
      }
      major.kode = cleanKode;
    }
    if (nama_jurusan) major.nama_jurusan = String(nama_jurusan).trim();
    if (status === 'AKTIF' || status === 'NONAKTIF') major.status = status;
    major.updated_at = new Date().toISOString();

    store.addAudit('major_upsert', req.staff!.full_name, 'ADMIN', major.id, `Memperbarui jurusan ${major.kode} — ${major.nama_jurusan}`);
    store.save(true);
    broadcastDashboardUpdate('major:updated');
    res.json({ major });
  });

  app.delete('/api/majors/:id', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const state = store.getState();
    const idx = state.majors.findIndex((m) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Data jurusan tidak ditemukan.' });
    const [removed] = state.majors.splice(idx, 1);
    store.addAudit('major_upsert', req.staff!.full_name, 'ADMIN', removed.id, `Menghapus jurusan ${removed.kode} — ${removed.nama_jurusan}`);
    store.save(true);
    broadcastDashboardUpdate('major:deleted');
    res.json({ ok: true });
  });

  app.get('/api/admin/staff', requireStaff(['ADMIN']), (_req, res) => {
    const staff = store.getState().staff_users.map((u) => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name,
      role: u.role,
      assigned_classes: u.assigned_classes,
      active: u.active,
      created_at: u.created_at,
    }));
    res.json({ staff });
  });

  app.post('/api/admin/staff', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const { username, full_name, role, password, assigned_classes } = req.body ?? {};
    const cleanUsername = String(username ?? '').trim().toLowerCase();
    if (!cleanUsername || !full_name || typeof password !== 'string' || password.trim().length < 6) {
      return res.status(400).json({ error: 'Username, nama lengkap, dan kata sandi (min 6 karakter) wajib diisi.' });
    }
    const state = store.getState();
    if (state.staff_users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return res.status(409).json({ error: `Username "${cleanUsername}" sudah digunakan.` });
    }
    const newStaff = {
      id: `stf-${crypto.randomUUID().slice(0, 8)}`,
      username: cleanUsername,
      full_name: String(full_name).trim(),
      role: (role === 'ADMIN' ? 'ADMIN' : 'PENGAWAS') as 'ADMIN' | 'PENGAWAS',
      assigned_classes: Array.isArray(assigned_classes)
        ? assigned_classes.map((c: unknown) => String(c).trim()).filter(Boolean)
        : [],
      active: true,
      password_hash: hashPassword(password.trim()),
      created_at: new Date().toISOString(),
    };
    state.staff_users.push(newStaff);
    store.addAudit('staff_upsert', req.staff!.full_name, 'ADMIN', newStaff.id, `Menambahkan akun ${newStaff.role} (${newStaff.username})`);
    store.save(true);
    broadcastDashboardUpdate('staff:created');

    res.status(201).json({
      staff: {
        id: newStaff.id,
        username: newStaff.username,
        full_name: newStaff.full_name,
        role: newStaff.role,
        assigned_classes: newStaff.assigned_classes,
        active: newStaff.active,
        created_at: newStaff.created_at,
      },
    });
  });

  app.patch('/api/admin/staff/:id', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const found = store.getState().staff_users.find((u) => u.id === req.params.id);
    if (!found) return res.status(404).json({ error: 'Akun staff tidak ditemukan.' });
    const { full_name, active, assigned_classes, password } = req.body ?? {};
    if (full_name) found.full_name = String(full_name).trim();
    if (typeof active === 'boolean') {
      if (found.id === req.staff?.id && !active) {
        return res.status(400).json({ error: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' });
      }
      found.active = active;
    }
    if (Array.isArray(assigned_classes)) {
      found.assigned_classes = assigned_classes.map((c: unknown) => String(c).trim()).filter(Boolean);
    }
    if (password !== undefined) {
      if (typeof password !== 'string' || password.trim().length < 6) {
        return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
      }
      found.password_hash = hashPassword(password.trim());
    }
    const actionSummary =
      password !== undefined
        ? `Mengubah kata sandi akun ${found.role} (${found.username})`
        : `Memperbarui akun ${found.role} (${found.username})`;
    store.addAudit('staff_upsert', req.staff!.full_name, 'ADMIN', found.id, actionSummary);
    store.save(true);
    broadcastDashboardUpdate('staff:updated');

    res.json({
      staff: {
        id: found.id,
        username: found.username,
        full_name: found.full_name,
        role: found.role,
        assigned_classes: found.assigned_classes,
        active: found.active,
        created_at: found.created_at,
      },
    });
  });

  app.delete('/api/admin/staff/:id', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const state = store.getState();
    const idx = state.staff_users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Akun staff tidak ditemukan.' });
    }
    const target = state.staff_users[idx];
    if (target.id === req.staff?.id) {
      return res.status(400).json({ error: 'Anda tidak dapat menghapus akun yang sedang digunakan.' });
    }
    if (target.role === 'ADMIN') {
      const remainingActiveAdmins = state.staff_users.filter(
        (u) => u.id !== target.id && u.role === 'ADMIN' && u.active
      );
      if (remainingActiveAdmins.length === 0) {
        return res.status(400).json({ error: 'Minimal harus tersisa satu akun Admin yang aktif.' });
      }
    }

    state.staff_users.splice(idx, 1);
    store.addAudit(
      'staff_delete',
      req.staff!.full_name,
      'ADMIN',
      target.id,
      `Menghapus akun ${target.role} (${target.username})`
    );
    store.save(true);
    broadcastDashboardUpdate('staff:deleted');
    res.json({ ok: true });
  });

  app.get('/api/admin/audit-logs', requireStaff(['ADMIN']), (_req, res) => {
    res.json({ audit_logs: store.getState().audit_logs });
  });

  app.get('/api/admin/sheet-sync', requireStaff(['ADMIN']), (_req, res) => {
    res.json({ config: store.getPublicSyncConfig() });
  });

  app.patch('/api/admin/sheet-sync', requireStaff(['ADMIN']), (req: AuthRequest, res) => {
    const { web_app_url, sync_secret, auto_sync_enabled, auto_sync_interval_sec, auto_push_on_change } = req.body ?? {};
    const cfg = store.getState().sheet_sync;

    if (typeof web_app_url === 'string') {
      const check = validateAppsScriptUrl(web_app_url);
      if (!check.valid) return res.status(400).json({ error: check.error });
      cfg.web_app_url = check.normalized;
    }
    if (typeof sync_secret === 'string') {
      cfg.sync_secret = sync_secret.trim();
    }
    if (typeof auto_sync_enabled === 'boolean') {
      cfg.auto_sync_enabled = auto_sync_enabled;
    }
    if (auto_sync_interval_sec !== undefined) {
      cfg.auto_sync_interval_sec = [0, 30, 60, 300].includes(Number(auto_sync_interval_sec))
        ? Number(auto_sync_interval_sec)
        : 60;
    }
    if (typeof auto_push_on_change === 'boolean') {
      cfg.auto_push_on_change = auto_push_on_change;
    }

    store.save(false);
    sheetSyncService.rescheduleInterval();
    broadcastDashboardUpdate('sheet:config_updated');
    res.json({ config: store.getPublicSyncConfig() });
  });

  app.post('/api/admin/sheet-sync/push', requireStaff(['ADMIN']), async (req: AuthRequest, res) => {
    const result = await sheetSyncService.pushAll(req.staff!.full_name);
    res.status(result.ok ? 200 : 400).json({ ...result, config: store.getPublicSyncConfig() });
  });

  app.post('/api/admin/sheet-sync/pull', requireStaff(['ADMIN']), async (req: AuthRequest, res) => {
    const result = await sheetSyncService.pullMasterData(req.staff!.full_name);
    res.status(result.ok ? 200 : 400).json({ ...result, config: store.getPublicSyncConfig() });
  });

  app.get('/api/admin/export-assets', requireStaff(['ADMIN']), (_req, res) => {
    const appsScriptPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
    const supabaseSqlPath = path.resolve(process.cwd(), 'supabase/schema.sql');
    const appsScriptCode = fs.existsSync(appsScriptPath) ? fs.readFileSync(appsScriptPath, 'utf8') : '';
    const supabaseSql = fs.existsSync(supabaseSqlPath) ? fs.readFileSync(supabaseSqlPath, 'utf8') : '';
    res.json({ appsScriptCode, supabaseSql });
  });

  // =========================================================================
  // VITE / STATIC SPA SERVING
  // =========================================================================
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`UJIAN LOCK SMESA server running on http://0.0.0.0:${PORT}`);
  });
}

createAppServer().catch((err) => {
  console.error('Failed to start UJIAN LOCK SMESA server:', err);
  process.exit(1);
});
