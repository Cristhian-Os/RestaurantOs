-- Reversa de habilitar Premium (2026-11-20): vuelve a no disponible. El precio no se cambió (325.000, sede extra 65.000).
UPDATE public.planes SET disponible = false, updated_at = now() WHERE id = 'premium';
