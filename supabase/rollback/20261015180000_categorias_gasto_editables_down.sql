-- Reversa de 20261015180000_categorias_gasto_editables.sql
-- Borra la tabla de categorías. Los gastos NO se tocan: conservan su texto en gastos.categoria
-- y la app vuelve a mostrar los nombres de las categorías sugeridas.
DROP TABLE IF EXISTS public.categorias_gasto;
