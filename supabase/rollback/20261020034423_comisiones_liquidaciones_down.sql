-- Rollback Bloque 8, pasos 7 y 8 (funciones de comisiones y liquidaciones). No toca datos.
DROP FUNCTION IF EXISTS public.plataforma_deuda_vendedores();
DROP FUNCTION IF EXISTS public.plataforma_liquidacion_guardar_recibo(uuid, text);
DROP FUNCTION IF EXISTS public.registrar_pago_liquidacion(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.aprobar_liquidacion(uuid);
DROP FUNCTION IF EXISTS public.plataforma_liquidacion_editar(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.plataforma_liquidacion_detalle(uuid);
DROP FUNCTION IF EXISTS public.plataforma_liquidaciones_listar(text);
DROP FUNCTION IF EXISTS public.crear_liquidaciones(date);
DROP FUNCTION IF EXISTS public.anular_comision(uuid, text);
DROP FUNCTION IF EXISTS public._liq_recalcular(uuid);
DROP FUNCTION IF EXISTS public.ajustar_por_devolucion(uuid);
DROP FUNCTION IF EXISTS public.calcular_comisiones(date);
