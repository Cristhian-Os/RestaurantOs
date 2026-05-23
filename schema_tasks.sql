-- ============================================================
-- RESTAURANTOS — SISTEMA DE TAREAS CON EVIDENCIA FOTOGRÁFICA
-- Ejecutar en Supabase SQL Editor DESPUÉS del schema principal
-- ============================================================

-- ============================================================
-- 1. STORAGE BUCKET para fotos de evidencia
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-evidence',
  'task-evidence',
  true,                          -- público para facilitar visualización
  5242880,                       -- 5MB máximo por foto
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Política de storage: empleados suben a su propia carpeta
DROP POLICY IF EXISTS "Employees can upload own evidence" ON storage.objects;
CREATE POLICY "Employees can upload own evidence" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'task-evidence'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

DROP POLICY IF EXISTS "Anyone can read task evidence" ON storage.objects;
CREATE POLICY "Anyone can read task evidence" ON storage.objects
  FOR SELECT USING (bucket_id = 'task-evidence');

DROP POLICY IF EXISTS "Admins can delete evidence" ON storage.objects;
CREATE POLICY "Admins can delete evidence" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'task-evidence'
    AND public.is_admin()
  );

-- ============================================================
-- 2. TABLA TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description TEXT        CHECK (char_length(description) <= 1000),
  assigned_to UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  priority    TEXT        NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to  ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by   ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date     ON public.tasks(due_date)
  WHERE due_date IS NOT NULL;

-- Auto updated_at
DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. TABLA TASK_EVIDENCE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_evidence (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  photo_url    TEXT        NOT NULL,
  storage_path TEXT        NOT NULL,
  notes        TEXT        CHECK (char_length(notes) <= 500),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_task_id ON public.task_evidence(task_id);

-- ============================================================
-- 4. RLS EN TASKS
-- ============================================================
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage all tasks"    ON public.tasks;
DROP POLICY IF EXISTS "Employee can view own tasks"   ON public.tasks;
DROP POLICY IF EXISTS "Employee can update own status" ON public.tasks;

-- Admin: acceso total
CREATE POLICY "Admin can manage all tasks" ON public.tasks
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

-- Empleado: solo ve tareas asignadas a él
CREATE POLICY "Employee can view own tasks" ON public.tasks
  FOR SELECT USING (
    auth.uid() = assigned_to
    AND public.get_user_role() IN ('waiter', 'kitchen', 'cashier')
  );

-- Empleado: puede cambiar status de SUS tareas
-- Solo permite transiciones válidas:
--   pending     → in_progress
--   in_progress → completed  (solo si ya envió evidencia, validado en el cliente)
--   rejected    → in_progress (reintentar)
CREATE POLICY "Employee can update own task status" ON public.tasks
  FOR UPDATE
  USING (
    auth.uid() = assigned_to
    AND public.get_user_role() IN ('waiter', 'kitchen', 'cashier')
  )
  WITH CHECK (
    auth.uid() = assigned_to
    AND status IN ('in_progress', 'completed')
  );

-- ============================================================
-- 5. RLS EN TASK_EVIDENCE
-- ============================================================
ALTER TABLE public.task_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view all evidence"      ON public.task_evidence;
DROP POLICY IF EXISTS "Employee can view own evidence"   ON public.task_evidence;
DROP POLICY IF EXISTS "Employee can submit evidence"     ON public.task_evidence;

-- Admin: ve toda la evidencia
CREATE POLICY "Admin can view all evidence" ON public.task_evidence
  FOR SELECT USING (public.is_admin());

-- Empleado: ve evidencia de sus propias tareas
CREATE POLICY "Employee can view own evidence" ON public.task_evidence
  FOR SELECT USING (auth.uid() = uploaded_by);

-- Empleado: sube evidencia solo para tareas asignadas a él
CREATE POLICY "Employee can submit evidence" ON public.task_evidence
  FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by
    AND EXISTS (
      SELECT 1 FROM public.tasks
      WHERE id = task_id
        AND assigned_to = auth.uid()
        AND status = 'in_progress'
    )
  );

-- ============================================================
-- 6. FUNCIÓN: Completar tarea con evidencia (operación atómica)
--    Sube la evidencia y cambia el status a 'completed' en una
--    sola transacción para evitar race conditions.
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_task_with_evidence(
  p_task_id      UUID,
  p_photo_url    TEXT,
  p_storage_path TEXT,
  p_notes        TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task       public.tasks%ROWTYPE;
  v_evidence   public.task_evidence%ROWTYPE;
BEGIN
  -- Verificar que la tarea pertenece al usuario y está en_progreso
  SELECT * INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
    AND assigned_to = auth.uid()
    AND status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarea no encontrada o no está en progreso'
      USING ERRCODE = 'P0001';
  END IF;

  -- Insertar evidencia
  INSERT INTO public.task_evidence (task_id, uploaded_by, photo_url, storage_path, notes)
  VALUES (p_task_id, auth.uid(), p_photo_url, p_storage_path, p_notes)
  RETURNING * INTO v_evidence;

  -- Marcar tarea como completada
  UPDATE public.tasks
  SET status = 'completed', updated_at = NOW()
  WHERE id = p_task_id;

  RETURN json_build_object(
    'task_id',     p_task_id,
    'evidence_id', v_evidence.id,
    'status',      'completed'
  );
END;
$$;

-- ============================================================
-- 7. VISTA para el admin: tareas con datos del asignado
-- ============================================================
CREATE OR REPLACE VIEW public.tasks_with_profiles AS
  SELECT
    t.*,
    p.full_name   AS assignee_name,
    p.role        AS assignee_role,
    creator.full_name AS creator_name,
    (
      SELECT COUNT(*)
      FROM public.task_evidence e
      WHERE e.task_id = t.id
    ) AS evidence_count
  FROM public.tasks t
  LEFT JOIN public.profiles p       ON p.id = t.assigned_to
  LEFT JOIN public.profiles creator ON creator.id = t.created_by;

-- ============================================================
-- RESUMEN
-- ============================================================
-- Storage bucket:  task-evidence
-- Tablas nuevas:   tasks, task_evidence
-- Función:         complete_task_with_evidence(task_id, url, path, notes)
-- Vista:           tasks_with_profiles
--
-- Realtime: habilitar en Supabase Dashboard →
--   Database → Replication → tasks (INSERT, UPDATE, DELETE)
-- ============================================================
