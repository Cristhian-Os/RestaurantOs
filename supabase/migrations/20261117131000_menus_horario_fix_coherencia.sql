-- Corrige _menu_horario_coherencia_trg: Postgres no garantiza el orden de evaluación de "TG_TABLE_NAME = x AND ... NEW.campo",
-- así que consultaba NEW.dish_id en tablas que no lo tienen (franjas, excepciones). Se separa en IF anidados.
CREATE OR REPLACE FUNCTION public._menu_horario_coherencia_trg() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_TABLE_NAME IN ('menu_horario_franjas','menu_horario_productos','menu_horario_excepciones') THEN
    IF NOT EXISTS (SELECT 1 FROM menus_horario WHERE id = NEW.menu_id AND restaurant_id = NEW.restaurant_id) THEN
      RAISE EXCEPTION 'El menú no pertenece a este restaurante';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'menu_horario_productos' THEN
    IF NOT EXISTS (SELECT 1 FROM dishes WHERE id = NEW.dish_id AND restaurant_id = NEW.restaurant_id) THEN
      RAISE EXCEPTION 'El producto no pertenece a este restaurante';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'menu_horario_franjas' THEN
    IF NEW.dia_especial_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM menu_horario_dias_especiales WHERE id = NEW.dia_especial_id AND restaurant_id = NEW.restaurant_id) THEN
      RAISE EXCEPTION 'El día especial no pertenece a este restaurante';
    END IF;
  END IF;
  RETURN NEW;
END $$;
