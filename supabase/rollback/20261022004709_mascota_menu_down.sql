-- Reversa de 20261022004709_mascota_menu (las mascotas ya subidas dejan de mostrarse; los archivos quedan en el almacenamiento).
ALTER TABLE public.restaurant_config DROP COLUMN IF EXISTS mascota_url;
