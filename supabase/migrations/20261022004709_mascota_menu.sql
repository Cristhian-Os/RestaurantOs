-- Módulo E (prompt maestro Resti): el menú QR puede mostrar la mascota del restaurante como imagen fija (sin poses).
-- Una sola columna nueva y opcional en restaurant_config; sin mascota, el menú no muestra ningún personaje.
-- Aditiva. Reversa: supabase/rollback/20261022004709_mascota_menu_down.sql
ALTER TABLE public.restaurant_config ADD COLUMN IF NOT EXISTS mascota_url text CHECK (mascota_url IS NULL OR char_length(mascota_url) <= 500);
