import crypto from 'crypto';
import type { Exam, Student } from '../src/types.ts';
import { hashPassword, store, validateGoogleFormUrl } from './store.ts';

/**
 * Strict SSRF protection: Only allow official Google Apps Script HTTPS Web App endpoints.
 */
export function validateAppsScriptUrl(rawUrl: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: true, normalized: '' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { valid: false, normalized: '', error: 'URL Google Apps Script wajib menggunakan HTTPS.' };
    }
    const host = parsed.hostname.toLowerCase();
    const allowed = host === 'script.google.com' || host === 'script.googleusercontent.com';
    if (!allowed) {
      return {
        valid: false,
        normalized: '',
        error: 'Hanya URL resmi Google Apps Script (https://script.google.com/...) yang diizinkan.',
      };
    }
    return { valid: true, normalized: parsed.toString() };
  } catch {
    return { valid: false, normalized: '', error: 'Format URL Google Apps Script tidak valid.' };
  }
}

export class GoogleSheetSyncService {
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isSyncing = false;
  private onAfterSync?: () => void;

  public start(onAfterSync: () => void) {
    this.onAfterSync = onAfterSync;
    this.rescheduleInterval();
    store.onMutation(() => {
      const cfg = store.getState().sheet_sync;
      if (cfg.web_app_url && cfg.auto_sync_enabled && cfg.auto_push_on_change) {
        if (this.pushDebounceTimer) clearTimeout(this.pushDebounceTimer);
        this.pushDebounceTimer = setTimeout(() => {
          void this.pushAll('Auto-Sync (Perubahan Data)');
        }, 2500);
      }
    });
  }

  public rescheduleInterval() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    const cfg = store.getState().sheet_sync;
    if (cfg.web_app_url && cfg.auto_sync_enabled && cfg.auto_sync_interval_sec >= 15) {
      this.intervalTimer = setInterval(() => {
        void this.syncBidirectional('Auto-Sync Terjadwal');
      }, cfg.auto_sync_interval_sec * 1000);
    }
  }

  public async syncBidirectional(triggeredBy: string) {
    await this.pullMasterData(triggeredBy);
    await this.pushAll(triggeredBy);
  }

  public async pushAll(triggeredBy: string): Promise<{ ok: boolean; message: string; records: number }> {
    const state = store.getState();
    const cfg = state.sheet_sync;
    if (!cfg.web_app_url) {
      return { ok: false, message: 'URL Google Apps Script belum dikonfigurasi.', records: 0 };
    }
    const check = validateAppsScriptUrl(cfg.web_app_url);
    if (!check.valid) {
      return { ok: false, message: check.error || 'URL tidak valid.', records: 0 };
    }
    if (this.isSyncing) {
      return { ok: false, message: 'Proses sinkronisasi lain sedang berjalan.', records: 0 };
    }

    this.isSyncing = true;
    const nowIso = new Date().toISOString();
    try {
      const sanitizedStaffUsers = state.staff_users.map((u) => ({
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        role: u.role,
        assigned_classes: u.assigned_classes.join(', '),
        active: u.active ? 'AKTIF' : 'NONAKTIF',
        password: '[TERENKRIPSI]',
        created_at: u.created_at,
      }));

      const payload = {
        action: 'push',
        secret: cfg.sync_secret || '',
        data: {
          staff_users: sanitizedStaffUsers,
          students: state.students,
          exams: state.exams,
          exam_sessions: state.exam_sessions,
          tokens: state.tokens,
          violations: state.violations,
          activity_logs: state.activity_logs.slice(0, 200),
          audit_logs: state.audit_logs.slice(0, 200),
        },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(check.normalized, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await response.text();
      let parsed: { ok?: boolean; error?: string; counts?: Record<string, number> } = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Respons Apps Script bukan JSON valid. Pastikan Web App di-deploy dengan akses Anyone.');
      }

      if (!response.ok || parsed.ok === false) {
        throw new Error(parsed.error || `HTTP ${response.status}`);
      }

      const totalRecords =
        state.staff_users.length +
        state.students.length +
        state.exams.length +
        state.exam_sessions.length +
        state.tokens.length +
        state.violations.length;

      cfg.last_sync_at = nowIso;
      cfg.last_sync_status = 'SUCCESS';
      cfg.last_sync_message = `Berhasil mengirim ${totalRecords} baris data ke Google Sheet.`;
      cfg.history.unshift({
        id: `syn-${crypto.randomUUID().slice(0, 8)}`,
        direction: 'PUSH',
        status: 'SUCCESS',
        message: cfg.last_sync_message,
        records_affected: totalRecords,
        triggered_by: triggeredBy,
        created_at: nowIso,
      });
      cfg.history = cfg.history.slice(0, 30);

      store.addAudit('sheet_sync_push', triggeredBy, 'ADMIN', null, cfg.last_sync_message, {
        records: totalRecords,
      });
      store.save(false);
      this.onAfterSync?.();

      return { ok: true, message: cfg.last_sync_message, records: totalRecords };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Gagal menghubungi Google Apps Script.';
      cfg.last_sync_at = nowIso;
      cfg.last_sync_status = 'ERROR';
      cfg.last_sync_message = errMsg;
      cfg.history.unshift({
        id: `syn-${crypto.randomUUID().slice(0, 8)}`,
        direction: 'PUSH',
        status: 'ERROR',
        message: errMsg,
        records_affected: 0,
        triggered_by: triggeredBy,
        created_at: nowIso,
      });
      cfg.history = cfg.history.slice(0, 30);
      store.save(false);
      this.onAfterSync?.();
      return { ok: false, message: errMsg, records: 0 };
    } finally {
      this.isSyncing = false;
    }
  }

  public async pullMasterData(triggeredBy: string): Promise<{ ok: boolean; message: string; records: number }> {
    const state = store.getState();
    const cfg = state.sheet_sync;
    if (!cfg.web_app_url) {
      return { ok: false, message: 'URL Google Apps Script belum dikonfigurasi.', records: 0 };
    }
    const check = validateAppsScriptUrl(cfg.web_app_url);
    if (!check.valid) {
      return { ok: false, message: check.error || 'URL tidak valid.', records: 0 };
    }
    if (this.isSyncing) {
      return { ok: false, message: 'Proses sinkronisasi lain sedang berjalan.', records: 0 };
    }

    this.isSyncing = true;
    const nowIso = new Date().toISOString();
    try {
      const targetUrl = new URL(check.normalized);
      targetUrl.searchParams.set('action', 'pull');
      if (cfg.sync_secret) {
        targetUrl.searchParams.set('secret', cfg.sync_secret);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(targetUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await response.text();
      let parsed: {
        ok?: boolean;
        error?: string;
        data?: {
          staff_users?: Array<Record<string, unknown>>;
          students?: Array<Record<string, unknown>>;
          exams?: Array<Record<string, unknown>>;
        };
      } = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Respons Apps Script bukan JSON valid. Periksa izin akses Web App.');
      }

      if (!response.ok || parsed.ok === false) {
        throw new Error(parsed.error || `HTTP ${response.status}`);
      }

      let mergedCount = 0;
      const incomingStudents = parsed.data?.students || [];
      for (const row of incomingStudents) {
        const nis = String(row.nis ?? '').trim();
        const nama = String(row.nama ?? '').trim();
        if (!nis || !nama) continue;

        const kelas = String(row.kelas ?? 'XII').trim();
        const jurusan = String(row.jurusan ?? '-').trim();
        const rawStatus = String(row.status ?? 'AKTIF').toUpperCase();
        const status: Student['status'] = rawStatus === 'NONAKTIF' ? 'NONAKTIF' : 'AKTIF';

        const existing = state.students.find((s) => s.nis === nis);
        if (existing) {
          existing.nama = nama;
          existing.kelas = kelas;
          existing.jurusan = jurusan;
          existing.status = status;
          existing.updated_at = nowIso;
        } else {
          state.students.push({
            id: String(row.id || `stu-${crypto.randomUUID().slice(0, 8)}`),
            nis,
            nama,
            kelas,
            jurusan,
            status,
            updated_at: nowIso,
          });
        }
        mergedCount++;
      }

      const incomingExams = parsed.data?.exams || [];
      for (const row of incomingExams) {
        const namaUjian = String(row.nama_ujian ?? '').trim();
        const rawFormUrl = String(row.google_form_url ?? '').trim();
        if (!namaUjian || !rawFormUrl) continue;
        const urlCheck = validateGoogleFormUrl(rawFormUrl);
        if (!urlCheck.valid) continue;

        const id = String(row.id || '').trim();
        const existing = id
          ? state.exams.find((e) => e.id === id)
          : state.exams.find((e) => e.nama_ujian === namaUjian);

        const rawStatus = String(row.status ?? 'TERJADWAL').toUpperCase();
        const status: Exam['status'] =
          rawStatus === 'AKTIF' || rawStatus === 'DRAFT' || rawStatus === 'SELESAI'
            ? rawStatus
            : 'TERJADWAL';

        const examData = {
          nama_ujian: namaUjian,
          mata_pelajaran: String(row.mata_pelajaran ?? '-').trim(),
          kelas: String(row.kelas ?? 'SEMUA').trim(),
          tanggal: String(row.tanggal ?? nowIso.slice(0, 10)).slice(0, 10),
          jam_mulai: String(row.jam_mulai ?? '07:30').trim(),
          jam_selesai: String(row.jam_selesai ?? '09:30').trim(),
          durasi: Math.max(10, Number(row.durasi) || 90),
          google_form_url: urlCheck.normalized,
          status,
          updated_at: nowIso,
        };

        if (existing) {
          Object.assign(existing, examData);
        } else {
          state.exams.push({
            id: id || `exm-${crypto.randomUUID().slice(0, 8)}`,
            ...examData,
            created_at: nowIso,
          });
        }
        mergedCount++;
      }

      let ingestedPlaintextStaffPassword = false;
      const incomingStaff = parsed.data?.staff_users || [];
      for (const row of incomingStaff) {
        const username = String(row.username ?? '').trim().toLowerCase();
        const fullName = String(row.full_name ?? '').trim();
        if (!username || !fullName || !/^[a-z0-9._-]{3,40}$/.test(username)) continue;

        const rawRole = String(row.role ?? 'PENGAWAS').trim().toUpperCase();
        const role: 'ADMIN' | 'PENGAWAS' = rawRole === 'ADMIN' ? 'ADMIN' : 'PENGAWAS';

        const rawClasses = String(row.assigned_classes ?? '').trim();
        const assignedClasses = rawClasses
          ? rawClasses
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean)
          : [];

        const rawActive = String(row.active ?? 'AKTIF').trim().toUpperCase();
        const active =
          rawActive !== 'FALSE' && rawActive !== 'NONAKTIF' && rawActive !== '0' && rawActive !== 'TIDAK';

        const rawPassword = String(row.password ?? '').trim();
        const hasNewPassword =
          rawPassword.length >= 6 &&
          rawPassword !== '[TERENKRIPSI]' &&
          rawPassword.toUpperCase() !== '[ENCRYPTED]';

        const existing = state.staff_users.find((u) => u.username.toLowerCase() === username);
        if (existing) {
          // Never deactivate the last remaining active ADMIN
          const otherActiveAdmins = state.staff_users.filter(
            (u) => u.id !== existing.id && u.role === 'ADMIN' && u.active
          ).length;
          existing.full_name = fullName;
          if (role === 'ADMIN' || otherActiveAdmins > 0) {
            existing.role = role;
          }
          if (active || existing.role !== 'ADMIN' || otherActiveAdmins > 0) {
            existing.active = active;
          }
          existing.assigned_classes = assignedClasses;
          if (hasNewPassword) {
            existing.password_hash = hashPassword(rawPassword);
            ingestedPlaintextStaffPassword = true;
          }
          mergedCount++;
        } else if (hasNewPassword) {
          // Only create brand-new staff accounts from sheet if a valid initial password (>=6 chars) is provided
          state.staff_users.push({
            id: String(row.id || `stf-${crypto.randomUUID().slice(0, 8)}`),
            username,
            full_name: fullName,
            role,
            assigned_classes: assignedClasses,
            active,
            password_hash: hashPassword(rawPassword),
            created_at: String(row.created_at || nowIso),
          });
          state.initialized_auth = true;
          ingestedPlaintextStaffPassword = true;
          mergedCount++;
        }
      }

      cfg.last_sync_at = nowIso;
      cfg.last_sync_status = 'SUCCESS';
      cfg.last_sync_message = `Berhasil menarik ${mergedCount} data Master Siswa, Ujian & Akun Staff dari Google Sheet.`;
      cfg.history.unshift({
        id: `syn-${crypto.randomUUID().slice(0, 8)}`,
        direction: 'PULL',
        status: 'SUCCESS',
        message: cfg.last_sync_message,
        records_affected: mergedCount,
        triggered_by: triggeredBy,
        created_at: nowIso,
      });
      cfg.history = cfg.history.slice(0, 30);

      store.addAudit('sheet_sync_pull', triggeredBy, 'ADMIN', null, cfg.last_sync_message, {
        records: mergedCount,
      });
      store.save(false);
      this.onAfterSync?.();

      // Immediately replace any plaintext password typed in Google Sheet with [TERENKRIPSI]
      if (ingestedPlaintextStaffPassword) {
        this.isSyncing = false;
        await this.pushAll(`${triggeredBy} (Masking Sandi Staff)`);
      }

      return { ok: true, message: cfg.last_sync_message, records: mergedCount };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Gagal menarik data dari Google Sheet.';
      cfg.last_sync_at = nowIso;
      cfg.last_sync_status = 'ERROR';
      cfg.last_sync_message = errMsg;
      cfg.history.unshift({
        id: `syn-${crypto.randomUUID().slice(0, 8)}`,
        direction: 'PULL',
        status: 'ERROR',
        message: errMsg,
        records_affected: 0,
        triggered_by: triggeredBy,
        created_at: nowIso,
      });
      cfg.history = cfg.history.slice(0, 30);
      store.save(false);
      this.onAfterSync?.();
      return { ok: false, message: errMsg, records: 0 };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const sheetSyncService = new GoogleSheetSyncService();
