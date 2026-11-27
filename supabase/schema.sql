-- ============================================================================
-- UJIAN LOCK SMESA — SMK NEGERI 1 JEMBER
-- Skema Database PostgreSQL / Supabase + RLS Policy + Server-Side RPC
-- Tagline: Ujian Tertib • Data Terpantau • Integritas Terjaga
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUM TYPES
DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('ADMIN', 'PENGAWAS', 'SISWA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE session_status_enum AS ENUM ('NOT_STARTED', 'ACTIVE', 'WARNING', 'LOCKED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE token_status_enum AS ENUM ('ACTIVE', 'USED', 'INVALID', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. TABEL PROFIL STAFF (Admin & Pengawas linked to auth.users)
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role user_role_enum NOT NULL DEFAULT 'PENGAWAS',
  assigned_classes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2b. TABEL MAJORS (Master Jurusan / Konsentrasi Keahlian)
CREATE TABLE IF NOT EXISTS public.majors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode TEXT NOT NULL UNIQUE,
  nama_jurusan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AKTIF' CHECK (status IN ('AKTIF', 'NONAKTIF')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABEL STUDENTS (Master Siswa)
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  nis TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  kelas TEXT NOT NULL,
  jurusan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AKTIF' CHECK (status IN ('AKTIF', 'NONAKTIF')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABEL EXAMS (Jadwal Ujian & URL Google Form)
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_ujian TEXT NOT NULL,
  mata_pelajaran TEXT NOT NULL,
  kelas TEXT NOT NULL,
  tanggal DATE NOT NULL,
  jam_mulai TIME NOT NULL,
  jam_selesai TIME NOT NULL,
  durasi INTEGER NOT NULL CHECK (durasi > 0),
  google_form_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'TERJADWAL' CHECK (status IN ('DRAFT', 'TERJADWAL', 'AKTIF', 'SELESAI')),
  assigned_proctor_id UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TABEL TOKENS
CREATE TABLE IF NOT EXISTS public.tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  used_by_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  status token_status_enum NOT NULL DEFAULT 'ACTIVE',
  is_unlock_token BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  issued_by UUID REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  issued_by_name TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ
);

-- 6. TABEL EXAM_SESSIONS
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status session_status_enum NOT NULL DEFAULT 'NOT_STARTED',
  violation_count INTEGER NOT NULL DEFAULT 0,
  current_token_id UUID REFERENCES public.tokens(id) ON DELETE SET NULL,
  last_activity TEXT NOT NULL DEFAULT 'Belum memulai',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlocked_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (exam_id, student_id)
);

-- 7. TABEL VIOLATIONS
CREATE TABLE IF NOT EXISTS public.violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.exam_sessions(session_id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'tab_switch',
      'window_blur',
      'fullscreen_exit',
      'page_visibility_hidden',
      'attempt_leave_page',
      'session_reconnect'
    )
  ),
  detail TEXT NOT NULL DEFAULT '',
  violation_number INTEGER NOT NULL,
  resulting_status session_status_enum NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. TABEL ACTIVITY_LOGS
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.exam_sessions(session_id) ON DELETE CASCADE,
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  activity TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TABEL AUDIT_LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  target_id TEXT,
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. INDEXES
CREATE INDEX IF NOT EXISTS idx_students_nis ON public.students(nis);
CREATE INDEX IF NOT EXISTS idx_sessions_exam_status ON public.exam_sessions(exam_id, status);
CREATE INDEX IF NOT EXISTS idx_tokens_code ON public.tokens(code);
CREATE INDEX IF NOT EXISTS idx_violations_session ON public.violations(session_id, created_at DESC);

-- 11. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.majors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function cek role
CREATE OR REPLACE FUNCTION public.get_staff_role()
RETURNS user_role_enum
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.staff_profiles WHERE id = auth.uid() AND is_active = TRUE;
$$;

-- RLS POLICIES: ADMIN FULL ACCESS
CREATE POLICY "admin_all_majors" ON public.majors
  FOR ALL USING (public.get_staff_role() = 'ADMIN');
CREATE POLICY "pengawas_read_majors" ON public.majors
  FOR SELECT USING (public.get_staff_role() = 'PENGAWAS');
CREATE POLICY "admin_all_students" ON public.students
  FOR ALL USING (public.get_staff_role() = 'ADMIN');
CREATE POLICY "admin_all_exams" ON public.exams
  FOR ALL USING (public.get_staff_role() = 'ADMIN');
CREATE POLICY "admin_all_tokens" ON public.tokens
  FOR ALL USING (public.get_staff_role() = 'ADMIN');
CREATE POLICY "admin_all_sessions" ON public.exam_sessions
  FOR ALL USING (public.get_staff_role() = 'ADMIN');
CREATE POLICY "admin_all_violations" ON public.violations
  FOR ALL USING (public.get_staff_role() = 'ADMIN');
CREATE POLICY "admin_all_activity" ON public.activity_logs
  FOR ALL USING (public.get_staff_role() = 'ADMIN');
CREATE POLICY "admin_all_audit" ON public.audit_logs
  FOR ALL USING (public.get_staff_role() = 'ADMIN');

-- RLS POLICIES: PENGAWAS (Hanya ujian & peserta tanggung jawabnya)
CREATE POLICY "pengawas_read_exams" ON public.exams
  FOR SELECT USING (
    public.get_staff_role() = 'PENGAWAS'
    AND (assigned_proctor_id IS NULL OR assigned_proctor_id = auth.uid())
  );

CREATE POLICY "pengawas_read_sessions" ON public.exam_sessions
  FOR SELECT USING (
    public.get_staff_role() = 'PENGAWAS'
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_sessions.exam_id
        AND (e.assigned_proctor_id IS NULL OR e.assigned_proctor_id = auth.uid())
    )
  );

CREATE POLICY "pengawas_read_violations" ON public.violations
  FOR SELECT USING (
    public.get_staff_role() = 'PENGAWAS'
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = violations.exam_id
        AND (e.assigned_proctor_id IS NULL OR e.assigned_proctor_id = auth.uid())
    )
  );

-- RLS POLICIES: SISWA (Hanya boleh membaca sesi miliknya sendiri)
CREATE POLICY "siswa_read_own_session" ON public.exam_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = exam_sessions.student_id
        AND s.auth_user_id = auth.uid()
    )
  );

-- 12. SERVER-SIDE RPC FUNCTIONS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.validate_token_and_start_session(
  p_nis TEXT,
  p_token_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_token public.tokens%ROWTYPE;
  v_exam public.exams%ROWTYPE;
  v_session public.exam_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_student FROM public.students WHERE nis = p_nis AND status = 'AKTIF';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NIS tidak ditemukan atau status siswa tidak aktif.';
  END IF;

  SELECT * INTO v_token FROM public.tokens WHERE code = UPPER(TRIM(p_token_code)) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token tidak ditemukan.';
  END IF;

  IF v_token.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Token sudah tidak berlaku atau telah dibatalkan.';
  END IF;

  IF v_token.expires_at < NOW() THEN
    UPDATE public.tokens SET status = 'EXPIRED' WHERE id = v_token.id;
    RAISE EXCEPTION 'Masa berlaku token telah habis.';
  END IF;

  IF v_token.student_id IS NOT NULL AND v_token.student_id <> v_student.id THEN
    RAISE EXCEPTION 'Token khusus ini hanya berlaku untuk siswa lain.';
  END IF;

  IF v_token.used_by_student_id IS NOT NULL AND v_token.used_by_student_id <> v_student.id THEN
    RAISE EXCEPTION 'Token sudah digunakan oleh peserta lain.';
  END IF;

  SELECT * INTO v_exam FROM public.exams WHERE id = v_token.exam_id;
  IF v_exam.status <> 'AKTIF' THEN
    RAISE EXCEPTION 'Ujian belum diaktifkan oleh pengawas.';
  END IF;

  SELECT * INTO v_session FROM public.exam_sessions
  WHERE exam_id = v_exam.id AND student_id = v_student.id FOR UPDATE;

  IF FOUND AND v_session.status = 'LOCKED' AND NOT v_token.is_unlock_token THEN
    RAISE EXCEPTION 'Sesi ujian Anda sedang TERKUNCI. Gunakan TOKEN BARU dari pengawas.';
  END IF;

  UPDATE public.tokens
    SET used_by_student_id = v_student.id, status = 'USED'
    WHERE id = v_token.id;

  IF NOT FOUND THEN
    INSERT INTO public.exam_sessions (exam_id, student_id, started_at, status, violation_count, current_token_id, last_activity, last_activity_at)
    VALUES (v_exam.id, v_student.id, NOW(), 'ACTIVE', 0, v_token.id, 'Validasi token berhasil', NOW())
    RETURNING * INTO v_session;
  ELSE
    UPDATE public.exam_sessions
    SET status = 'ACTIVE',
        current_token_id = v_token.id,
        violation_count = CASE WHEN v_token.is_unlock_token THEN 0 ELSE violation_count END,
        last_activity = CASE WHEN v_token.is_unlock_token THEN 'Sesi dibuka kembali dengan token baru' ELSE 'Sesi dilanjutkan' END,
        last_activity_at = NOW()
    WHERE session_id = v_session.session_id
    RETURNING * INTO v_session;
  END IF;

  INSERT INTO public.audit_logs(action, actor_name, actor_role, target_id, summary)
  VALUES ('validasi_token', v_student.nama, 'SISWA', v_session.session_id::TEXT, 'Token divalidasi untuk ' || v_exam.nama_ujian);

  RETURN jsonb_build_object(
    'session_id', v_session.session_id,
    'status', v_session.status,
    'exam', to_jsonb(v_exam),
    'student', to_jsonb(v_student)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_student_and_issue_token(
  p_session_id UUID,
  p_expiry_minutes INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff public.staff_profiles%ROWTYPE;
  v_session public.exam_sessions%ROWTYPE;
  v_new_code TEXT;
  v_new_token public.tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_staff FROM public.staff_profiles WHERE id = auth.uid() AND is_active = TRUE;
  IF NOT FOUND OR v_staff.role NOT IN ('ADMIN', 'PENGAWAS') THEN
    RAISE EXCEPTION 'Akses ditolak. Hanya Admin atau Pengawas yang berwenang.';
  END IF;

  SELECT * INTO v_session FROM public.exam_sessions WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi peserta tidak ditemukan.';
  END IF;

  -- Invalidate token lama
  IF v_session.current_token_id IS NOT NULL THEN
    UPDATE public.tokens
    SET status = 'INVALID', invalidated_at = NOW()
    WHERE id = v_session.current_token_id;
  END IF;

  v_new_code := 'UNLK-' || UPPER(SUBSTR(ENCODE(gen_random_bytes(4), 'hex'), 1, 6));

  INSERT INTO public.tokens (code, exam_id, student_id, status, is_unlock_token, expires_at, issued_by, issued_by_name)
  VALUES (v_new_code, v_session.exam_id, v_session.student_id, 'ACTIVE', TRUE, NOW() + (p_expiry_minutes || ' minutes')::INTERVAL, v_staff.id, v_staff.full_name)
  RETURNING * INTO v_new_token;

  UPDATE public.exam_sessions
  SET unlocked_count = unlocked_count + 1,
      last_activity = 'Token buka kunci diterbitkan oleh ' || v_staff.full_name,
      last_activity_at = NOW()
  WHERE session_id = v_session.session_id;

  INSERT INTO public.audit_logs(action, actor_name, actor_role, target_id, summary)
  VALUES ('token_baru', v_staff.full_name, v_staff.role::TEXT, v_session.session_id::TEXT, 'Menerbitkan token buka kunci ' || v_new_code);

  RETURN to_jsonb(v_new_token);
END;
$$;

-- 13. AKTIFKAN SUPABASE REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.violations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tokens;
