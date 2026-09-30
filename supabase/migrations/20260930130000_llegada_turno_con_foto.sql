-- Llegada al turno con foto en vivo (tomada con la cámara en la app) y
-- aprobación del administrador.
--  • shift_checkins: una llegada por turno (employee_schedules).
--  • Bucket PRIVADO shift-checkins: fotos de personas; el admin las ve con URL firmada.
--  • Escritura solo vía funciones (registrar_llegada / revisar_llegada): la tabla no tiene
--    políticas de INSERT/UPDATE, así que el cliente no puede falsear estado ni fecha.

CREATE TABLE IF NOT EXISTS public.shift_checkins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT current_restaurant_id() REFERENCES public.restaurants (id),
  schedule_id   uuid NOT NULL UNIQUE REFERENCES public.employee_schedules (id) ON DELETE CASCADE,
  employee_id   uuid NOT NULL REFERENCES public.profiles (id),
  photo_path    text NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   uuid REFERENCES public.profiles (id),
  reviewed_at   timestamptz,
  review_note   text CHECK (char_length(review_note) <= 300)
);
CREATE INDEX IF NOT EXISTS shift_checkins_restaurant_status_idx ON public.shift_checkins (restaurant_id, status);
ALTER TABLE public.shift_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employee views own checkins" ON public.shift_checkins FOR SELECT
  USING (employee_id = (SELECT auth.uid()));
CREATE POLICY "Admin views restaurant checkins" ON public.shift_checkins FOR SELECT
  USING (((SELECT is_admin()) AND restaurant_id = (SELECT current_restaurant_id())) OR (SELECT is_super_admin()));

-- El empleado registra su llegada: solo a SU turno y solo el día del turno (hora Colombia).
-- Si la anterior fue rechazada, puede volver a intentarlo (se reemplaza la foto).
CREATE OR REPLACE FUNCTION public.registrar_llegada(p_schedule_id uuid, p_photo_path text)
RETURNS public.shift_checkins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sched public.employee_schedules%ROWTYPE;
  v_row   public.shift_checkins;
BEGIN
  SELECT * INTO v_sched FROM public.employee_schedules
   WHERE id = p_schedule_id AND employee_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno no encontrado'; END IF;
  IF v_sched.work_date <> public.hoy_local() THEN
    RAISE EXCEPTION 'Solo puedes registrar tu llegada el día de tu turno';
  END IF;
  IF p_photo_path IS NULL OR split_part(p_photo_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Foto inválida';
  END IF;

  INSERT INTO public.shift_checkins (restaurant_id, schedule_id, employee_id, photo_path)
  VALUES (v_sched.restaurant_id, p_schedule_id, auth.uid(), p_photo_path)
  ON CONFLICT (schedule_id) DO UPDATE
    SET photo_path = EXCLUDED.photo_path, checked_in_at = now(), status = 'pending',
        reviewed_by = NULL, reviewed_at = NULL, review_note = NULL
    WHERE public.shift_checkins.status = 'rejected'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Ya registraste tu llegada a este turno'; END IF;
  RETURN v_row;
END;
$function$;

-- El admin aprueba o rechaza (solo llegadas de su restaurante).
CREATE OR REPLACE FUNCTION public.revisar_llegada(p_checkin_id uuid, p_aprobar boolean, p_nota text DEFAULT NULL)
RETURNS public.shift_checkins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_row public.shift_checkins;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo el administrador puede revisar llegadas'; END IF;
  UPDATE public.shift_checkins
     SET status = CASE WHEN p_aprobar THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = NULLIF(trim(p_nota), '')
   WHERE id = p_checkin_id AND restaurant_id = public.current_restaurant_id()
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Llegada no encontrada'; END IF;
  RETURN v_row;
END;
$function$;

-- Fotos: bucket privado, carpeta = id del empleado.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shift-checkins', 'shift-checkins', false, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Employees upload own checkin photo" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shift-checkins' AND (auth.uid())::text = (string_to_array(name, '/'))[1]);
CREATE POLICY "Employee reads own checkin photo" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'shift-checkins' AND (auth.uid())::text = (string_to_array(name, '/'))[1]);
-- El admin solo ve fotos de empleados de SU restaurante.
CREATE POLICY "Admin reads restaurant checkin photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'shift-checkins' AND is_admin() AND EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id::text = (string_to_array(name, '/'))[1] AND p.restaurant_id = current_restaurant_id()));
