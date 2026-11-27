/**
 * UJIAN LOCK SMESA — Google Sheets & Apps Script Database Connector (v2)
 * SMK NEGERI 1 JEMBER
 * Tagline: Ujian Tertib • Data Terpantau • Integritas Terjaga
 *
 * TAB DATABASE OTOMATIS (9 TAB):
 * 1. staff_users   -> Akun Admin & Pengawas (pendaftaran massal via Sheet, sandi otomatis di-hash server)
 * 2. majors        -> Master Input Jurusan (kode, nama_jurusan, status)
 * 3. students      -> Master Input Siswa (NIS disimpan sebagai teks agar nol di depan tidak hilang)
 * 4. exams         -> Jadwal Ujian & URL Google Form
 * 5. exam_sessions -> Status peserta realtime (NOT_STARTED, ACTIVE, WARNING, LOCKED, COMPLETED)
 * 6. tokens        -> Token ujian unik & token buka kunci
 * 7. violations    -> Log pelanggaran browser peserta
 * 8. activity_logs -> Aktivitas terbaru ruang ujian
 * 9. audit_logs    -> Audit log keamanan sistem
 *
 * CARA DEPLOY (ANTI GAGAL):
 * 1. Buka Google Sheets baru (misal: "DB_UJIAN_LOCK_SMESA").
 * 2. Klik menu Ekstensi (Extensions) -> Apps Script.
 * 3. Hapus seluruh isi Code.gs lalu tempel seluruh kode ini & simpan (Ctrl+S).
 * 4. (Opsional) Jika menjalankan sebagai Apps Script terpisah (standalone), atur di
 *    Project Settings -> Script Properties:
 *    - SPREADSHEET_ID = <ID_Google_Sheet_Anda>
 *    - SYNC_SECRET    = <kata_sandi_sinkronisasi_rahasia_opsional>
 * 5. Jalankan fungsi `setupSheets()` satu kali (atau muat ulang Google Sheet lalu klik
 *    menu "UJIAN LOCK SMESA" -> "Inisialisasi 9 Tab Database").
 * 6. Klik Deploy -> New deployment -> pilih jenis "Web app":
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Salin URL Web App (`https://script.google.com/macros/s/.../exec`) ke Dashboard Admin
 *    UJIAN LOCK SMESA -> menu "Google Sheet & Script".
 */

var SHEET_SCHEMAS = {
  staff_users: ['id', 'username', 'full_name', 'role', 'assigned_classes', 'active', 'password', 'created_at'],
  majors: ['id', 'kode', 'nama_jurusan', 'status', 'updated_at'],
  students: ['id', 'nis', 'nama', 'kelas', 'jurusan', 'status', 'updated_at'],
  exams: ['id', 'nama_ujian', 'mata_pelajaran', 'kelas', 'tanggal', 'jam_mulai', 'jam_selesai', 'durasi', 'google_form_url', 'status', 'created_at', 'updated_at'],
  exam_sessions: ['session_id', 'exam_id', 'student_id', 'started_at', 'ended_at', 'status', 'violation_count', 'current_token_id', 'last_activity', 'last_activity_at', 'unlocked_count', 'is_fullscreen'],
  tokens: ['id', 'code', 'exam_id', 'student_id', 'used_by_student_id', 'status', 'is_unlock_token', 'expires_at', 'issued_by', 'issued_by_role', 'issued_at', 'invalidated_at'],
  violations: ['id', 'session_id', 'exam_id', 'student_id', 'event_type', 'detail', 'violation_number', 'resulting_status', 'created_at'],
  activity_logs: ['id', 'session_id', 'exam_id', 'student_id', 'actor_name', 'actor_role', 'activity', 'created_at'],
  audit_logs: ['id', 'action', 'actor_name', 'actor_role', 'target_id', 'summary', 'created_at']
};

/**
 * Kolom yang wajib diformat sebagai teks murni ('@') agar Google Sheets tidak
 * menghapus angka 0 di depan NIS atau mengubah jam 07:30 menjadi objek tanggal 1899.
 */
var TEXT_ONLY_COLUMNS = {
  id: true,
  nis: true,
  kode: true,
  username: true,
  password: true,
  code: true,
  tanggal: true,
  jam_mulai: true,
  jam_selesai: true,
  session_id: true,
  exam_id: true,
  student_id: true
};

/**
 * Menu kustom otomatis saat Google Sheets dibuka
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('UJIAN LOCK SMESA')
      .addItem('Inisialisasi 9 Tab Database', 'setupSheets')
      .addItem('Isi Contoh Header & Jurusan Awal', 'seedDefaultMajors')
      .addToUi();
  } catch (err) {
    // Diabaikan ketika dipanggil dari konteks Web App tanpa UI
  }
}

/**
 * Mengambil Spreadsheet aktif (mendukung container-bound maupun standalone via SPREADSHEET_ID)
 */
function getTargetSpreadsheet() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SPREADSHEET_ID');
  if (sheetId && sheetId.trim() !== '') {
    return SpreadsheetApp.openById(sheetId.trim());
  }
  throw new Error(
    'Spreadsheet tidak ditemukan. Tempel kode ini lewat menu Ekstensi -> Apps Script dari dalam Google Sheets, atau isi Script Property SPREADSHEET_ID.'
  );
}

/**
 * Inisialisasi seluruh 9 tab lembar kerja beserta format header dan kolom teks
 */
function setupSheets() {
  var ss = getTargetSpreadsheet();
  Object.keys(SHEET_SCHEMAS).forEach(function (sheetName) {
    var headers = SHEET_SCHEMAS[sheetName];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      formatHeaderRow(sheet, headers.length);
    }
    applyTextColumnFormats(sheet, headers, Math.max(sheet.getLastRow(), 200));
  });
  SpreadsheetApp.flush();
}

/**
 * Opsional: Mengisi Master Jurusan awal SMK Negeri 1 Jember jika tab majors masih kosong
 */
function seedDefaultMajors() {
  setupSheets();
  var ss = getTargetSpreadsheet();
  var sheet = ss.getSheetByName('majors');
  if (sheet.getLastRow() > 1) return;

  var nowIso = new Date().toISOString();
  var defaults = [
    ['maj-rpl', 'RPL', 'Rekayasa Perangkat Lunak', 'AKTIF', nowIso],
    ['maj-tkj', 'TKJ', 'Teknik Komputer & Jaringan', 'AKTIF', nowIso],
    ['maj-akl', 'AKL', 'Akuntansi & Keuangan Lembaga', 'AKTIF', nowIso],
    ['maj-bdp', 'BDP', 'Bisnis Daring & Pemasaran', 'AKTIF', nowIso],
    ['maj-otkp', 'OTKP', 'Otomatisasi & Tata Kelola Perkantoran', 'AKTIF', nowIso],
    ['maj-dkv', 'DKV', 'Desain Komunikasi Visual', 'AKTIF', nowIso]
  ];
  sheet.getRange(2, 1, defaults.length, 5).setNumberFormat('@').setValues(defaults);
  SpreadsheetApp.flush();
}

function formatHeaderRow(sheet, colCount) {
  sheet.getRange(1, 1, 1, colCount)
    .setBackground('#0B1F3A')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function applyTextColumnFormats(sheet, headers, rowCount) {
  var safeRows = Math.max(2, rowCount);
  for (var c = 0; c < headers.length; c++) {
    if (TEXT_ONLY_COLUMNS[headers[c]]) {
      sheet.getRange(2, c + 1, safeRows, 1).setNumberFormat('@');
    }
  }
}

function verifySecret(providedSecret) {
  var expected = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
  if (!expected || expected.trim() === '') {
    return true; // Tidak disetel = mode terbuka untuk lab internal sekolah
  }
  return String(providedSecret || '').trim() === String(expected).trim();
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeCellValue(val, headerKey, tz) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    // Google Sheets menyimpan jam murni (misal 07:30) sebagai tanggal tahun 1899
    if (headerKey === 'jam_mulai' || headerKey === 'jam_selesai' || val.getFullYear() === 1899) {
      return Utilities.formatDate(val, tz, 'HH:mm');
    }
    if (headerKey === 'tanggal') {
      return Utilities.formatDate(val, tz, 'yyyy-MM-dd');
    }
    return val.toISOString();
  }
  return val;
}

function readSheetAsObjects(sheetName) {
  var ss = getTargetSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone() || 'Asia/Jakarta';
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function (h) {
    return String(h || '').trim().toLowerCase().replace(/\s+/g, '_');
  });
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var hasValue = row.some(function (cell) {
      return cell !== '' && cell !== null && cell !== undefined;
    });
    if (!hasValue) continue;

    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      if (!key) continue;
      obj[key] = normalizeCellValue(row[j], key, tz);
    }
    rows.push(obj);
  }
  return rows;
}

function overwriteSheetFromObjects(sheetName, items) {
  var ss = getTargetSpreadsheet();
  var headers = SHEET_SCHEMAS[sheetName];
  if (!headers) return 0;

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  var safeItems = Array.isArray(items) ? items : [];
  var rows = [headers];
  safeItems.forEach(function (item) {
    var line = headers.map(function (key) {
      var v = item ? item[key] : '';
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return TEXT_ONLY_COLUMNS[key] ? String(v) : v;
    });
    rows.push(line);
  });

  sheet.clearContents();
  if (rows.length > 1) {
    applyTextColumnFormats(sheet, headers, rows.length);
  }
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  formatHeaderRow(sheet, headers.length);
  return safeItems.length;
}

function buildPullResponse() {
  setupSheets();
  return jsonResponse({
    ok: true,
    timestamp: new Date().toISOString(),
    data: {
      staff_users: readSheetAsObjects('staff_users'),
      majors: readSheetAsObjects('majors'),
      students: readSheetAsObjects('students'),
      exams: readSheetAsObjects('exams')
    }
  });
}

/**
 * GET ?action=pull|ping&secret=...
 * Menarik Master Akun Staff, Master Jurusan, Master Siswa, dan Jadwal Ujian ke sistem utama.
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    if (!verifySecret(params.secret)) {
      return jsonResponse({ ok: false, error: 'Unauthorized: SYNC_SECRET tidak cocok.' });
    }

    var action = String(params.action || 'pull').toLowerCase();
    if (action === 'ping') {
      setupSheets();
      return jsonResponse({
        ok: true,
        app: 'UJIAN LOCK SMESA',
        school: 'SMK NEGERI 1 JEMBER',
        sheets: Object.keys(SHEET_SCHEMAS),
        timestamp: new Date().toISOString()
      });
    }

    return buildPullResponse();
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * POST JSON { action: "push"|"pull"|"ping", secret: "...", data: { ... } }
 * Menyimpan seluruh 9 tabel dari sistem utama ke masing-masing tab Google Sheet secara atomik.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    lockAcquired = lock.tryLock(15000);
    if (!lockAcquired) {
      return jsonResponse({ ok: false, error: 'Server Google Sheet sedang sibuk memproses sinkronisasi lain. Coba beberapa detik lagi.' });
    }

    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var body = JSON.parse(rawBody);
    if (!verifySecret(body.secret)) {
      return jsonResponse({ ok: false, error: 'Unauthorized: SYNC_SECRET tidak cocok.' });
    }

    var action = String(body.action || 'push').toLowerCase();
    if (action === 'ping') {
      setupSheets();
      return jsonResponse({ ok: true, app: 'UJIAN LOCK SMESA', timestamp: new Date().toISOString() });
    }
    if (action === 'pull') {
      return buildPullResponse();
    }

    setupSheets();
    var data = body.data || {};
    var counts = {};

    Object.keys(SHEET_SCHEMAS).forEach(function (tableName) {
      if (Array.isArray(data[tableName])) {
        counts[tableName] = overwriteSheetFromObjects(tableName, data[tableName]);
      }
    });

    SpreadsheetApp.flush();

    return jsonResponse({
      ok: true,
      synced_at: new Date().toISOString(),
      counts: counts
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}
