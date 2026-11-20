-- Cierra la ejecución pública de las funciones internas de disparadores de "Menús por horario".
-- Postgres no deja llamarlas fuera de un disparador, pero por defecto quedan con EXECUTE para PUBLIC (aviso del advisor de Supabase).
-- Los disparadores siguen funcionando: se ejecutan con los permisos del dueño de la tabla, no del usuario.
REVOKE ALL ON FUNCTION public._menu_horario_auditar_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._menu_horario_coherencia_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._restaurant_config_zona_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._zona_horaria_valida(text) FROM PUBLIC, anon, authenticated;
