-- Reversa de 20261114150000_central_conexiones: quita solo lo que esa migración agregó (nada más).
-- Las integraciones se borran únicamente si siguen "no conectadas" (si alguna se llegó a activar, se avisa en vez de borrarla).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.central_integraciones
             WHERE id IN ('claude', 'nvidia', 'deepseek', 'instagram_facebook', 'tiktok', 'youtube', 'x_twitter') AND estado <> 'no_conectada') THEN
    RAISE EXCEPTION 'Hay integraciones ya conectadas o pendientes: desconéctalas antes de revertir';
  END IF;
END $$;
DELETE FROM public.central_integraciones WHERE id IN ('claude', 'nvidia', 'deepseek', 'instagram_facebook', 'tiktok', 'youtube', 'x_twitter');
DELETE FROM public.central_config WHERE clave IN ('ia_encendida', 'ia_tope_mensual_usd', 'ia_modelo_defecto', 'ia_modelos', 'ia_precios');
