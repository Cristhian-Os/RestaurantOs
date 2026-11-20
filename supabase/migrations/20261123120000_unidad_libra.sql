-- Agrega "libra" como unidad de medida válida para ingredientes (antes: kg, litro, pieza, gramo, ml, paquete).
-- Solo amplía la lista permitida; no cambia ni borra datos. Reversible quitando 'libra' (si ningún ingrediente la usa).
ALTER TABLE public.ingredientes DROP CONSTRAINT IF EXISTS ingredientes_unidad_medida_check;
ALTER TABLE public.ingredientes
  ADD CONSTRAINT ingredientes_unidad_medida_check
  CHECK (unidad_medida = ANY (ARRAY['kg','litro','pieza','gramo','libra','ml','paquete']));
