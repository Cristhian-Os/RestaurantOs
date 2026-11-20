-- Reversa de 20261120130000_cerrar_verificar_cliente_y_search_path
GRANT EXECUTE ON FUNCTION public.verificar_cliente_pidio_plato(uuid, text) TO anon, authenticated;
ALTER FUNCTION public._fid_campana_valores(jsonb, text, text, integer) RESET search_path;
ALTER FUNCTION public._fid_no_editar() RESET search_path;
ALTER FUNCTION public._fid_seg_normalizar(jsonb) RESET search_path;
ALTER FUNCTION public._fid_tel(text) RESET search_path;
ALTER FUNCTION public._items_pedido(jsonb) RESET search_path;
ALTER FUNCTION public._mesa_codigo_trg() RESET search_path;
ALTER FUNCTION public._num(text) RESET search_path;
