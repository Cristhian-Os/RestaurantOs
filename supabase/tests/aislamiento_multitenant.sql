-- PRUEBA DE AISLAMIENTO MULTI-TENANT (generica, dirigida por el catalogo). SOLO para un proyecto/base de PRUEBA.
-- Como correrla y como leerla: supabase/tests/README_aislamiento.md
--
-- Que hace (todo dentro de un unico bloque DO que termina con RAISE EXCEPTION 'TEST_OUTPUT': todo se revierte):
--  0. Crea 2 restaurantes (A y B), usuarios de cada rol y siembra filas en TODAS las tablas de `public` con restaurant_id
--     (y en las tablas hijas que cuelgan por FK de un restaurante). Imprime la cobertura "sembradas X de Y".
--  1. Para cada actor (admin/cashier/waiter/kitchen de A, admin A inactivo, cliente sin restaurante, super_admin SIN aal2, anon)
--     y para cada tabla/vista: SELECT, UPDATE, DELETE, INSERT y "secuestro" (mover filas propias a B) sobre filas de B.
--  2. Para cada funcion SECURITY DEFINER ejecutable por authenticated/anon: la llama con ids de B (argumentos plausibles) y
--     comprueba que no devuelve datos de B ni cambia nada de B. Con "control positivo": si ni el dueno de B logra ejecutarla
--     con esos argumentos, el rechazo es "no concluyente" y se avisa (no se cuenta como OK).
--  3. Vistas, perfil inactivo, storage (politicas/_asset_ok de restaurant-assets y branding).
-- Cada linea termina en ": OK" o ": FALLA ..." ; las lineas AVISO / NO CUBIERTO / INFO no cuentan, pero hay que leerlas.
-- Ultima linea: "RESUMEN: N OK, M FALLA".
DO $$
DECLARE
  r text := ''; n int := 0; x text; i int; k int;
  ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); uw uuid := gen_random_uuid(); uk uuid := gen_random_uuid();
  ui uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ucl uuid := gen_random_uuid();
  ub uuid := gen_random_uuid(); ubc uuid := gen_random_uuid(); ubw uuid := gen_random_uuid(); ubk uuid := gen_random_uuid();
  actors jsonb; ctls jsonb; ac jsonb; ct jsonb;
  rels jsonb := '[]'; rel jsonb; relname text; relk text; tc text; pkc text;
  pkcol jsonb := '{}'; pktype jsonb := '{}'; inscols jsonb := '{}'; seedrow jsonb := '{}'; seedpk jsonb := '{}'; seederr jsonb := '{}';
  rec record; cl record; fn record; rowj2 jsonb; o_esc text[];
  -- siembra
  pass int; tn int; attempt int; tag text; rid uuid; uid_ uuid; key text; cols text; vals text; val text; sqltxt text; rowj jsonb;
  fkrel text; fkcol text; lit text; isrich boolean; has_rid_ref boolean; bt oid; btname text; typt "char"; mk text;
  nrel_seed int := 0; nrel_ok int := 0; skipped text := '';
  -- pruebas de tablas
  cnt bigint; nrows bigint; fb uuid; fbtag text; cond text; allowed text; wl jsonb; wl_all jsonb; wl_anon jsonb;
  o_sel text[]; o_upd text[]; o_del text[]; o_ins text[]; o_hij text[]; o_scan text[]; i_ins text[]; i_other text[]; xx text;
  nrel int; op text; err text; st text; reported text; txt text; fbs text[]; fbpks text[]; ownsees int; ownchk int;
  -- funciones
  fnames text[]; ftypes oid[]; nargs int; argv text[]; argtxt text; ok_cov boolean; why text; callsql text; ids_b text[];
  cand jsonb; candl text[]; variants int; vr int; argmap jsonb; tabs_b jsonb; ctl_ok boolean; ctl_err text; res jsonb;
  b_before text; b_after text; snap_sql text; outt text; stripped text; leak boolean; hasbobj boolean; changed boolean;
  nf_total int := 0; nf_tested int := 0; nf_wl int := 0; nf_unc int := 0; wl_pub text[]; wl_cap text[];
  fl_ok int; fl_inc text[]; fl_avi text[]; fl_fal text[]; fl_cap text[]; fl_heur text[]; fl_noctl text[]; fn_inc text[]; fn_heur text[]; fn_anyctl boolean; fn_ctlerr text; arr text; t0 text;
  b_ids text[]; stem text; j int; nm text; ty text; permden boolean;
  v_sec int; vinv boolean;
  bk text; bkok boolean; objname text; pol_n int; ass boolean;
  leaky text := ''; lines text[]; ln text; n_ok int := 0; n_fail int := 0; n_aviso int := 0;
BEGIN
  ---------------------------------------------------------------------------------------------------------------
  -- 0. Preparacion: restaurantes, usuarios, perfiles
  ---------------------------------------------------------------------------------------------------------------
  INSERT INTO restaurants (id, name, slug, email_domain) VALUES
    (ra,'seeda_restaurante','aisl-a','aisl-a.test'),(rb,'seedb_restaurante','aisl-b','aisl-b.test');
  INSERT INTO auth.users (id, aud, role, email) VALUES
    (ua,'authenticated','authenticated','admin@aisl-a.test'),(uc,'authenticated','authenticated','cajero@aisl-a.test'),
    (uw,'authenticated','authenticated','mesero@aisl-a.test'),(uk,'authenticated','authenticated','cocina@aisl-a.test'),
    (ui,'authenticated','authenticated','inactivo@aisl-a.test'),(us,'authenticated','authenticated','super@aisl.test'),
    (ucl,'authenticated','authenticated','cliente@aisl.test'),
    (ub,'authenticated','authenticated','admin@aisl-b.test'),(ubc,'authenticated','authenticated','cajero@aisl-b.test'),
    (ubw,'authenticated','authenticated','mesero@aisl-b.test'),(ubk,'authenticated','authenticated','cocina@aisl-b.test');
  INSERT INTO profiles (id, role, full_name, email, restaurant_id, active) VALUES
    (ua,'admin','Admin A','admin@aisl-a.test',ra,true),(uc,'cashier','Cajero A','cajero@aisl-a.test',ra,true),
    (uw,'waiter','Mesero A','mesero@aisl-a.test',ra,true),(uk,'kitchen','Cocina A','cocina@aisl-a.test',ra,true),
    (ui,'admin','Inactivo A','inactivo@aisl-a.test',ra,false),(us,'super_admin','Super','super@aisl.test',NULL,true),
    (ucl,'client','Cliente','cliente@aisl.test',NULL,true),
    (ub,'admin','Admin B','admin@aisl-b.test',rb,true),(ubc,'cashier','Cajero B','cajero@aisl-b.test',rb,true),
    (ubw,'waiter','Mesero B','mesero@aisl-b.test',rb,true),(ubk,'kitchen','Cocina B','cocina@aisl-b.test',rb,true)
    ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, restaurant_id=EXCLUDED.restaurant_id, active=EXCLUDED.active,
      full_name=EXCLUDED.full_name, email=EXCLUDED.email;

  -- Actores de prueba. forbid = restaurantes cuyas filas NO debe tocar. own = su restaurante (para el "secuestro").
  actors := jsonb_build_array(
    jsonb_build_object('k','admin A',     'claims',jsonb_build_object('role','authenticated','sub',ua,'aal','aal1'),'db','authenticated','forbid',jsonb_build_array(rb),'own',ra),
    jsonb_build_object('k','cashier A',   'claims',jsonb_build_object('role','authenticated','sub',uc,'aal','aal1'),'db','authenticated','forbid',jsonb_build_array(rb),'own',ra),
    jsonb_build_object('k','waiter A',    'claims',jsonb_build_object('role','authenticated','sub',uw,'aal','aal1'),'db','authenticated','forbid',jsonb_build_array(rb),'own',ra),
    jsonb_build_object('k','kitchen A',   'claims',jsonb_build_object('role','authenticated','sub',uk,'aal','aal1'),'db','authenticated','forbid',jsonb_build_array(rb),'own',ra),
    jsonb_build_object('k','admin A INACTIVO (profiles.active=false)','claims',jsonb_build_object('role','authenticated','sub',ui,'aal','aal1'),'db','authenticated','forbid',jsonb_build_array(ra,rb),'own',NULL),
    jsonb_build_object('k','cliente sin restaurante','claims',jsonb_build_object('role','authenticated','sub',ucl,'aal','aal1'),'db','authenticated','forbid',jsonb_build_array(ra,rb),'own',NULL),
    jsonb_build_object('k','super_admin SIN aal2','claims',jsonb_build_object('role','authenticated','sub',us,'aal','aal1'),'db','authenticated','forbid',jsonb_build_array(ra,rb),'own',NULL),
    jsonb_build_object('k','anon',        'claims',jsonb_build_object('role','anon'),'db','anon','forbid',jsonb_build_array(ra,rb),'own',NULL));
  -- Controles positivos (quien SI deberia poder usar las funciones con ids de B): staff de B, super_admin con aal2 y anon.
  ctls := jsonb_build_array(
    jsonb_build_object('k','admin B','claims',jsonb_build_object('role','authenticated','sub',ub,'aal','aal1'),'db','authenticated'),
    jsonb_build_object('k','cashier B','claims',jsonb_build_object('role','authenticated','sub',ubc,'aal','aal1'),'db','authenticated'),
    jsonb_build_object('k','waiter B','claims',jsonb_build_object('role','authenticated','sub',ubw,'aal','aal1'),'db','authenticated'),
    jsonb_build_object('k','kitchen B','claims',jsonb_build_object('role','authenticated','sub',ubk,'aal','aal1'),'db','authenticated'),
    jsonb_build_object('k','super_admin aal2','claims',jsonb_build_object('role','authenticated','sub',us,'aal','aal2'),'db','authenticated'),
    jsonb_build_object('k','anon','claims',jsonb_build_object('role','anon'),'db','anon'));

  -- LISTA BLANCA (lo unico que se permite ver/usar sin ser del restaurante). Mantenla corta y justificada (README).
  --  * restaurants_public: directorio publico (id, slug, name) para resolver el QR del menu.
  --  * profiles: la propia fila de la persona.
  --  * anon + dishes disponibles / vista_productos_disponibles: el menu publico del QR.
  wl_all  := '{"restaurants_public":"true","profiles":"id = auth.uid()"}'::jsonb;
  wl_anon := '{"dishes":"available AND availability_status <> ''discontinued''","vista_productos_disponibles":"true"}'::jsonb;
  --  * Funciones publicas POR DISENO (el comensal anonimo las usa con el id del restaurante/plato/token del QR). Se listan, no se juzgan.
  wl_pub := ARRAY['config_publica','restaurante_publico','planes_publicos','listas_opciones_publicas','ingredientes_publicos',
    'obtener_interacciones_platos','online_payments_enabled','create_public_order','crear_comentario_plato','dejar_resena_plato',
    'obtener_comentarios_plato','obtener_resenas_aprobadas','reaccionar_plato','reaccionar_comentario_plato','mi_reaccion_plato',
    'reportar_comentario_plato','editar_comentario_plato','borrar_comentario_plato','verificar_cliente_pidio_plato',
    'tv_cocina_datos','tv_cocina_avanzar','tv_cocina_cancelar'];
  --  * "Capacidad por uuid de pedido" (el comensal anonimo cancela/edita/consulta SU pedido con el uuid como secreto). Solo para anon: AVISO.
  wl_cap := ARRAY['estado_pedido_publico','obtener_items_pedido_cliente','cancelar_orden','editar_items_pedido'];

  ---------------------------------------------------------------------------------------------------------------
  -- 1. Catalogo: tablas / vistas de public
  ---------------------------------------------------------------------------------------------------------------
  FOR rec IN
    SELECT c.relname::text AS nm, c.relkind::text AS rk,
      EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='restaurant_id' AND a.attnum>0 AND NOT a.attisdropped) AS has_rid,
      EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='f'
              AND (k.confrelid='public.restaurants'::regclass OR EXISTS (SELECT 1 FROM pg_attribute a2 WHERE a2.attrelid=k.confrelid AND a2.attname='restaurant_id' AND NOT a2.attisdropped))) AS fk_tenant,
      (SELECT a.attname::text FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
        WHERE i.indrelid=c.oid AND i.indisprimary AND i.indnatts=1) AS pk,
      (SELECT format_type(a.atttypid,NULL) FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
        WHERE i.indrelid=c.oid AND i.indisprimary AND i.indnatts=1) AS pkt,
      (SELECT string_agg(quote_ident(a.attname), ',' ORDER BY a.attnum) FROM pg_attribute a
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity<>'a') AS icols
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind IN ('r','p','v','m') ORDER BY 1
  LOOP
    pkcol := pkcol || jsonb_build_object(rec.nm, rec.pk); pktype := pktype || jsonb_build_object(rec.nm, rec.pkt);
    inscols := inscols || jsonb_build_object(rec.nm, rec.icols);
    IF rec.rk IN ('r','p') AND rec.nm = 'restaurants' THEN rels := rels || jsonb_build_object('n',rec.nm,'k','T','tc','id','pk',rec.pk);
    ELSIF rec.rk IN ('r','p') AND rec.has_rid THEN rels := rels || jsonb_build_object('n',rec.nm,'k','T','tc','restaurant_id','pk',rec.pk);
    ELSIF rec.rk IN ('r','p') AND rec.fk_tenant THEN rels := rels || jsonb_build_object('n',rec.nm,'k','C','tc',NULL,'pk',rec.pk);
    ELSIF rec.rk IN ('r','p') THEN rels := rels || jsonb_build_object('n',rec.nm,'k','G','tc',NULL,'pk',rec.pk);
    ELSIF rec.has_rid THEN rels := rels || jsonb_build_object('n',rec.nm,'k','V','tc','restaurant_id','pk',rec.pk);
    ELSE rels := rels || jsonb_build_object('n',rec.nm,'k','O','tc',NULL,'pk',rec.pk);
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------------------------------------------
  -- 2. Sembrador generico (como superusuario/dueno; respeta NOT NULL, FK y CHECK)
  ---------------------------------------------------------------------------------------------------------------
  -- filas "a mano": restaurants y profiles
  FOR tn IN 1..2 LOOP
    tag := CASE tn WHEN 1 THEN 'A' ELSE 'B' END;
    seedrow := seedrow || jsonb_build_object('restaurants|'||tag, (SELECT to_jsonb(t) FROM restaurants t WHERE t.id = CASE tn WHEN 1 THEN ra ELSE rb END));
    seedpk  := seedpk  || jsonb_build_object('restaurants|'||tag, (CASE tn WHEN 1 THEN ra ELSE rb END)::text);
    seedrow := seedrow || jsonb_build_object('profiles|'||tag, (SELECT to_jsonb(t) FROM profiles t WHERE t.id = CASE tn WHEN 1 THEN ua ELSE ub END));
    seedpk  := seedpk  || jsonb_build_object('profiles|'||tag, (CASE tn WHEN 1 THEN ua ELSE ub END)::text);
  END LOOP;

  FOR pass IN 1..6 LOOP
    FOR rel IN SELECT value FROM jsonb_array_elements(rels) WHERE value->>'k' IN ('T','C','G') AND value->>'n' NOT IN ('restaurants','profiles') LOOP
      relname := rel->>'n'; tc := rel->>'tc'; pkc := rel->>'pk';
      FOR tn IN 1..CASE WHEN rel->>'k' = 'G' THEN 1 ELSE 2 END LOOP
        tag := CASE WHEN rel->>'k' = 'G' THEN 'G' WHEN tn = 1 THEN 'A' ELSE 'B' END; key := relname||'|'||tag;
        CONTINUE WHEN seedrow ? key;
        rid := CASE WHEN tag = 'B' THEN rb ELSE ra END; uid_ := CASE WHEN tag = 'B' THEN ub ELSE ua END;
        PERFORM set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',uid_,'aal','aal1')::text, true);
        -- (a) quiza un trigger ya creo la fila del restaurante (p. ej. restaurant_config): adoptarla
        rowj := NULL;
        IF tc = 'restaurant_id' THEN
          BEGIN
            EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE restaurant_id = %L LIMIT 1', relname, rid) INTO rowj;
          EXCEPTION WHEN OTHERS THEN rowj := NULL; END;
        END IF;
        -- (b) insertarla: intento 1 = rico (marcadores en textos), 2 = minimo, 3 = minimo con json como arreglo, 4 = ademas columnas con default que tienen CHECK, 5 = textos en MAYUSCULAS alfanumericas (CHECK con regex)
        attempt := 0;
        WHILE rowj IS NULL AND attempt < 5 LOOP
          attempt := attempt + 1; isrich := (attempt = 1); cols := ''; vals := '';
          FOR cl IN
            SELECT a.attname::text AS an, a.attnum, a.atttypid, a.atttypmod, a.attnotnull, a.atthasdef,
                   EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid=a.attrelid AND k.contype='c' AND a.attnum = ANY (k.conkey)) AS inchk
            FROM pg_attribute a WHERE a.attrelid = ('public.'||quote_ident(relname))::regclass AND a.attnum>0 AND NOT a.attisdropped
              AND a.attgenerated='' AND a.attidentity='' ORDER BY a.attnum
          LOOP
            val := NULL; fkrel := NULL; fkcol := NULL;
            SELECT k.confrelid::regclass::text, (SELECT g.attname::text FROM pg_attribute g WHERE g.attrelid=k.confrelid AND g.attnum=k.confkey[1])
              INTO fkrel, fkcol FROM pg_constraint k
              WHERE k.conrelid=('public.'||quote_ident(relname))::regclass AND k.contype='f' AND k.conkey = ARRAY[cl.attnum]::int2[] LIMIT 1;
            IF cl.an = tc THEN val := quote_literal(rid::text);
            ELSIF fkrel IS NOT NULL THEN
              IF NOT (cl.attnotnull AND NOT cl.atthasdef) AND NOT (isrich AND NOT cl.atthasdef) THEN CONTINUE; END IF;
              IF fkrel IN ('users','auth.users','profiles','public.profiles') THEN val := quote_literal(uid_::text);
              ELSIF fkrel IN ('restaurants','public.restaurants') THEN val := quote_literal(rid::text);
              ELSE
                SELECT EXISTS (SELECT 1 FROM pg_attribute g WHERE g.attrelid=fkrel::regclass AND g.attname='restaurant_id' AND NOT g.attisdropped) INTO has_rid_ref;
                BEGIN
                  IF has_rid_ref THEN EXECUTE format('SELECT %I::text FROM %s WHERE restaurant_id=%L ORDER BY 1 LIMIT 1', fkcol, fkrel, rid) INTO lit;
                  ELSE EXECUTE format('SELECT %I::text FROM %s ORDER BY 1 LIMIT 1', fkcol, fkrel) INTO lit; END IF;
                EXCEPTION WHEN OTHERS THEN lit := NULL; END;
                IF lit IS NOT NULL THEN val := quote_literal(lit); END IF;
              END IF;
              IF val IS NULL THEN CONTINUE; END IF;
            ELSE
              CONTINUE WHEN cl.atthasdef AND NOT (attempt = 4 AND cl.inchk);
              bt := cl.atttypid; SELECT typtype, typname::text, typbasetype INTO typt, btname, bt FROM pg_type WHERE oid = cl.atttypid;
              IF typt = 'd' THEN SELECT typname::text INTO btname FROM pg_type WHERE oid = bt; typt := 'b'; END IF;
              lit := NULL;
              IF cl.inchk THEN
                SELECT substring(string_agg(pg_get_constraintdef(k.oid), ' ') from '''([^'']+)''') INTO lit
                  FROM pg_constraint k WHERE k.conrelid=('public.'||quote_ident(relname))::regclass AND k.contype='c' AND cl.attnum = ANY (k.conkey)
                  AND pg_get_constraintdef(k.oid) !~ '( ~ |<> ALL|<> ''|NOT )' AND pg_get_constraintdef(k.oid) ~ '(= ANY|= ''|IN \()';
              END IF;
              IF typt = 'e' THEN SELECT enumlabel::text INTO lit FROM pg_enum WHERE enumtypid = cl.atttypid ORDER BY enumsortorder LIMIT 1; END IF;
              IF btname IN ('text','varchar','bpchar','citext','name') THEN
                IF lit IS NULL THEN
                  IF cl.attnotnull OR (isrich AND NOT cl.inchk) THEN
                    lit := 'seed'||lower(tag)||'_'||cl.an||'_'||substr(md5(random()::text),1,6);
                    IF attempt = 5 THEN lit := upper('seed'||lower(tag)||substr(md5(random()::text),1,8)); END IF;
                    IF cl.atttypmod > 4 THEN lit := left(lit, cl.atttypmod-4); END IF;
                  END IF;
                END IF;
                IF lit IS NULL THEN CONTINUE; END IF;
                val := quote_literal(lit);
              ELSIF NOT cl.attnotnull THEN CONTINUE;
              ELSIF typt = 'e' THEN val := quote_literal(lit);
              ELSIF btname = 'uuid' THEN val := quote_literal(gen_random_uuid()::text);
              ELSIF btname IN ('int2','int4','int8','numeric','float4','float8') THEN val := '1';
              ELSIF btname = 'bool' THEN val := 'true';
              ELSIF btname = 'date' THEN val := 'current_date';
              ELSIF btname IN ('timestamp','timestamptz') THEN val := 'now()';
              ELSIF btname IN ('time','timetz') THEN val := quote_literal('12:00');
              ELSIF btname = 'interval' THEN val := quote_literal('1 hour');
              ELSIF btname IN ('jsonb','json') THEN val := quote_literal(CASE WHEN attempt >= 3 OR cl.an ~ '(items|lineas|lista|list|tags)' THEN '[]' ELSE '{}' END);
              ELSIF btname = 'bytea' THEN val := quote_literal('\x00');
              ELSIF btname = 'inet' THEN val := quote_literal('127.0.0.1');
              ELSIF left(btname,1) = '_' THEN val := quote_literal(CASE WHEN btname IN ('_text','_varchar') THEN '{seed'||lower(tag)||'_x}' ELSE '{}' END);
              ELSE CONTINUE; END IF;
              val := val || '::' || format_type(cl.atttypid, cl.atttypmod);
            END IF;
            cols := cols || CASE WHEN cols='' THEN '' ELSE ',' END || quote_ident(cl.an);
            vals := vals || CASE WHEN vals='' THEN '' ELSE ',' END || val;
          END LOOP;
          IF cols = '' THEN sqltxt := format('INSERT INTO public.%I DEFAULT VALUES RETURNING to_jsonb(%I)', relname, relname);
          ELSE sqltxt := format('INSERT INTO public.%I (%s) VALUES (%s) RETURNING to_jsonb(%I)', relname, cols, vals, relname); END IF;
          BEGIN
            EXECUTE sqltxt INTO rowj;
          EXCEPTION WHEN OTHERS THEN
            rowj := NULL; seederr := seederr || jsonb_build_object(key, left(replace(SQLERRM, E'\n',' '),160));
          END;
        END LOOP;
        IF rowj IS NOT NULL THEN
          seedrow := seedrow || jsonb_build_object(key, rowj);
          IF pkc IS NOT NULL THEN seedpk := seedpk || jsonb_build_object(key, rowj->>pkc); END IF;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RESET ROLE;
  -- Filas extra a mano: un plato NO disponible por restaurante (para comprobar que anon solo ve los disponibles).
  FOR tn IN 1..2 LOOP
    tag := CASE tn WHEN 1 THEN 'A' ELSE 'B' END;
    IF seedrow ? ('dishes|'||tag) THEN
      BEGIN
        EXECUTE format('INSERT INTO public.dishes (%s) SELECT %s FROM jsonb_populate_record(NULL::public.dishes, %L::jsonb)', inscols->>'dishes', inscols->>'dishes',
          (seedrow->('dishes|'||tag)) || jsonb_build_object('id',gen_random_uuid(),'available',false,'name','seed'||lower(tag)||'_plato_no_disponible'));
      EXCEPTION WHEN OTHERS THEN r := r || 'INFO: no se pudo sembrar plato no disponible de '||tag||': '||left(SQLERRM,100)||E'\n'; END;
    END IF;
  END LOOP;

  -- Datos mas realistas (para que las funciones de pedidos/caja lleguen a la parte de autorizacion y no mueran en validaciones):
  -- pedidos con un item real, B ademas con pedidos en cocina y listos, y stock suficiente.
  FOR tn IN 1..2 LOOP
    tag := CASE tn WHEN 1 THEN 'A' ELSE 'B' END;
    IF seedrow ? ('orders|'||tag) AND seedrow ? ('dishes|'||tag) THEN
      BEGIN
        EXECUTE format('UPDATE public.orders SET items=%L::jsonb, total=10, status=''pending'' WHERE id=%L', jsonb_build_array(jsonb_build_object('id',seedpk->>('dishes|'||tag),'name','seed'||lower(tag)||'_plato','price',10,'quantity',1))::text, seedpk->>('orders|'||tag));
        IF tag = 'B' THEN
          FOREACH x IN ARRAY ARRAY['cooking','ready'] LOOP
            EXECUTE format('SELECT to_jsonb(o) FROM public.orders o WHERE id=%L', seedpk->>'orders|B') INTO rowj;
            rowj := rowj || jsonb_build_object('id',gen_random_uuid(),'status',x,'order_number_today',NULL,'receipt_number',NULL,'idempotency_key',NULL);
            EXECUTE format('INSERT INTO public.orders (%s) SELECT %s FROM jsonb_populate_record(NULL::public.orders, %L::jsonb) RETURNING id::text', inscols->>'orders', inscols->>'orders', rowj::text) INTO lit;
            seedpk := seedpk || jsonb_build_object('orders#'||x||'|B', lit);
          END LOOP;
        END IF;
      EXCEPTION WHEN OTHERS THEN r := r || 'INFO: no se pudo enriquecer pedidos de '||tag||': '||left(SQLERRM,100)||E'\n'; END;
    END IF;
  END LOOP;
  BEGIN UPDATE public.ingredientes SET stock_actual = 1000 WHERE restaurant_id IN (ra, rb);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Cobertura
  SELECT count(*) INTO nrel_seed FROM jsonb_array_elements(rels) e WHERE e->>'k' IN ('T','C');
  FOR rel IN SELECT value FROM jsonb_array_elements(rels) WHERE value->>'k' IN ('T','C') LOOP
    relname := rel->>'n';
    IF seedrow ? (relname||'|A') AND seedrow ? (relname||'|B') THEN nrel_ok := nrel_ok + 1;
    ELSE skipped := skipped || relname || ' ['||coalesce(seederr->>(relname||'|A'), seederr->>(relname||'|B'), 'sin error: dependencia sin sembrar')||']; '; END IF;
  END LOOP;
  n := n + 1;
  r := r || n||') cobertura de siembra: sembradas '||nrel_ok||' de '||nrel_seed||' tablas con datos de A y B (restaurant_id o hijas por FK): '||
       CASE WHEN nrel_ok = nrel_seed THEN 'OK' ELSE 'FALLA (la prueba no cubre todas las tablas)' END||E'\n';
  IF skipped <> '' THEN r := r || 'AVISO: tablas NO sembradas (saltadas): '||skipped||E'\n'; END IF;
  SELECT string_agg(e->>'n'||CASE WHEN seedrow ? ((e->>'n')||'|G') THEN '' ELSE ' (sin sembrar: '||coalesce(left(seederr->>((e->>'n')||'|G'),70),'?')||')' END, ', ') INTO x FROM jsonb_array_elements(rels) e WHERE e->>'k' = 'G';
  r := r || 'INFO: tablas globales (sin restaurant_id ni FK a un restaurante; se revisan solo por marcadores): '||coalesce(x,'ninguna')||E'\n';
  SELECT string_agg(e->>'n', ', ') INTO x FROM jsonb_array_elements(rels) e WHERE e->>'k' IN ('V','O');
  r := r || 'INFO: vistas de public: '||coalesce(x,'ninguna')||E'\n';
  SELECT count(*) INTO k FROM information_schema.role_table_grants g JOIN jsonb_array_elements(rels) e ON e->>'n'=g.table_name AND e->>'k'='T'
    WHERE g.table_schema='public' AND g.grantee='anon' AND g.privilege_type='SELECT';
  r := r || 'INFO: anon tiene GRANT SELECT en '||k||' tablas con datos de restaurante (la unica barrera es RLS; lo ideal es revocarlo)'||E'\n';

  ---------------------------------------------------------------------------------------------------------------
  -- 3. Tablas y vistas: por actor, SELECT / UPDATE / DELETE / INSERT / secuestro / marcadores
  ---------------------------------------------------------------------------------------------------------------
  FOR ac IN SELECT value FROM jsonb_array_elements(actors) LOOP
    o_sel := '{}'; o_upd := '{}'; o_del := '{}'; o_ins := '{}'; o_hij := '{}'; o_scan := '{}'; i_ins := '{}'; i_other := '{}';
    wl := wl_all || CASE WHEN ac->>'db' = 'anon' THEN wl_anon ELSE '{}'::jsonb END;
    fbs := ARRAY(SELECT jsonb_array_elements_text(ac->'forbid'));
    reported := ''; nrel := 0; ownsees := 0; ownchk := 0;
    FOR rel IN SELECT value FROM jsonb_array_elements(rels) LOOP
      relname := rel->>'n'; relk := rel->>'k'; tc := rel->>'tc'; pkc := rel->>'pk';
      -- condicion "fila de un restaurante prohibido"
      cond := NULL;
      IF tc IS NOT NULL THEN cond := format('%I::text = ANY (%L::text[])', tc, fbs);
      ELSIF relk = 'C' AND pkc IS NOT NULL THEN
        fbpks := '{}';
        FOREACH x IN ARRAY fbs LOOP fbpks := array_append(fbpks, seedpk->>(relname||'|'||CASE WHEN x = ra::text THEN 'A' ELSE 'B' END)); END LOOP;
        cond := format('%I::text = ANY (%L::text[])', pkc, fbpks);
      END IF;
      allowed := coalesce(wl->>relname, 'false');
      -- (S) SELECT
      IF cond IS NOT NULL THEN
        nrel := nrel + 1;
        PERFORM set_config('request.jwt.claims', (ac->'claims')::text, true);
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
          EXECUTE format('SELECT count(*) FROM public.%I WHERE (%s) AND NOT coalesce((%s), false)', relname, cond, allowed) INTO cnt;
          RESET ROLE;
          IF cnt > 0 THEN o_sel := array_append(o_sel, relname||' ('||cnt||' filas)'); reported := reported||'|'||relname||'|'; END IF;
        EXCEPTION WHEN OTHERS THEN
          RESET ROLE;
          IF SQLSTATE <> '42501' THEN i_other := array_append(i_other, 'SELECT '||relname||': '||left(replace(SQLERRM,E'\n',' '),80)); END IF;
        END;
        -- control positivo (solo admin A): ve filas propias en esa relacion
        IF ac->>'k' = 'admin A' AND tc IS NOT NULL AND relk <> 'O' THEN
          ownchk := ownchk + 1;
          BEGIN
            EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
            EXECUTE format('SELECT count(*) FROM public.%I WHERE %I::text = %L', relname, tc, ra::text) INTO cnt;
            RESET ROLE;
            IF cnt > 0 THEN ownsees := ownsees + 1; END IF;
          EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
        END IF;
        -- (U)/(D) UPDATE y DELETE de filas ajenas (deben afectar 0 filas o fallar). Se deshacen.
        FOREACH op IN ARRAY ARRAY['UPDATE','DELETE'] LOOP
          cnt := 0;
          BEGIN
            EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
            IF op = 'UPDATE' THEN EXECUTE format('UPDATE public.%I SET %I = %I WHERE %s', relname, coalesce(tc,pkc), coalesce(tc,pkc), cond);
            ELSE EXECUTE format('DELETE FROM public.%I WHERE %s', relname, cond); END IF;
            GET DIAGNOSTICS cnt = ROW_COUNT;
            RESET ROLE;
            RAISE EXCEPTION 'undo' USING ERRCODE = 'P9999';
          EXCEPTION WHEN OTHERS THEN
            RESET ROLE;
            IF SQLSTATE <> 'P9999' AND SQLSTATE <> '42501' AND relk <> 'V' THEN i_other := array_append(i_other, op||' '||relname||': '||left(replace(SQLERRM,E'\n',' '),80)); END IF;
          END;
          IF cnt > 0 THEN
            IF op = 'UPDATE' THEN o_upd := array_append(o_upd, relname||' ('||cnt||' filas)'); ELSE o_del := array_append(o_del, relname||' ('||cnt||' filas)'); END IF;
          END IF;
        END LOOP;
        -- (I) INSERT de una fila copiada de B (o de A si es prohibido), con pk nueva
        IF relk IN ('T','C') AND relname <> 'profiles' THEN
          FOREACH x IN ARRAY fbs LOOP
            tag := CASE WHEN x = ra::text THEN 'A' ELSE 'B' END;
            CONTINUE WHEN NOT seedrow ? (relname||'|'||tag);
            rowj := seedrow->(relname||'|'||tag);
            IF pkc IS NOT NULL AND pktype->>relname = 'uuid' THEN rowj := rowj || jsonb_build_object(pkc, gen_random_uuid()); END IF;
            IF rowj ? 'slug' AND relname = 'restaurants' THEN rowj := rowj || jsonb_build_object('slug','x'||substr(md5(random()::text),1,8)); END IF;
            cnt := 0; err := NULL; st := NULL;
            BEGIN
              EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
              EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, %L::jsonb)', relname, inscols->>relname, inscols->>relname, relname, rowj::text);
              GET DIAGNOSTICS cnt = ROW_COUNT;
              RESET ROLE;
              RAISE EXCEPTION 'undo' USING ERRCODE = 'P9999';
            EXCEPTION WHEN OTHERS THEN
              RESET ROLE; st := SQLSTATE; err := left(replace(SQLERRM,E'\n',' '),80);
            END;
            IF cnt > 0 THEN o_ins := array_append(o_ins, relname||' (inserto en '||tag||')');
            ELSIF st = 'P9999' OR st = '42501' THEN NULL;
            ELSIF st LIKE '23%' THEN i_ins := array_append(i_ins, relname||' ['||st||' '||err||']');
            END IF;
          END LOOP;
        END IF;
        -- (H) secuestro: mover filas propias al restaurante B (WITH CHECK)
        IF relk IN ('T','V') AND tc IS NOT NULL AND relname <> 'restaurants' AND (ac->>'own') IS NOT NULL THEN
          cnt := 0;
          BEGIN
            EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
            EXECUTE format('UPDATE public.%I SET %I = %L WHERE %I = %L', relname, tc, rb, tc, ac->>'own');
            GET DIAGNOSTICS cnt = ROW_COUNT;
            RESET ROLE;
            RAISE EXCEPTION 'undo' USING ERRCODE = 'P9999';
          EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
          IF cnt > 0 THEN o_hij := array_append(o_hij, relname||' ('||cnt||' filas movidas a B)'); END IF;
        END IF;
      END IF;
      -- (M) marcadores: ninguna relacion (con o sin restaurant_id) debe mostrar texto sembrado de un restaurante prohibido
      IF NOT wl ? relname AND position('|'||relname||'|' in reported) = 0 THEN
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
          EXECUTE format('SELECT coalesce(string_agg(q::text, E''\n''),'''') FROM (SELECT * FROM public.%I LIMIT 300) q', relname) INTO txt;
          RESET ROLE;
          FOREACH x IN ARRAY fbs LOOP
            IF position('seed'||CASE WHEN x = ra::text THEN 'a' ELSE 'b' END||'_' in txt) > 0 THEN
              o_scan := array_append(o_scan, relname||' (contiene datos sembrados de '||CASE WHEN x = ra::text THEN 'A' ELSE 'B' END||')');
              EXIT;
            END IF;
          END LOOP;
        EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
      END IF;
    END LOOP;
    -- informe de este actor
    IF ac->>'k' = 'admin A' THEN
      r := r || 'INFO: control positivo: admin A ve filas propias en '||ownsees||' de '||ownchk||' relaciones con restaurant_id (si es muy bajo, la prueba es poco informativa)'||E'\n';
    END IF;
    x := ac->>'k';
    FOREACH xx IN ARRAY ARRAY['SELECT','UPDATE','DELETE','INSERT','SECUESTRO (UPDATE restaurant_id -> B)','MARCADORES (lectura de texto ajeno en cualquier relacion)'] LOOP
      n := n + 1;
      DECLARE lst text[]; BEGIN
        lst := CASE left(xx,3) WHEN 'SEL' THEN o_sel WHEN 'UPD' THEN o_upd WHEN 'DEL' THEN o_del WHEN 'INS' THEN o_ins WHEN 'SEC' THEN o_hij ELSE o_scan END;
        IF coalesce(array_length(lst,1),0) = 0 THEN
          r := r || n||') '||x||': '||xx||' sobre filas '||CASE WHEN x IN ('admin A','cashier A','waiter A','kitchen A') THEN 'de B' ELSE 'de A y B' END||' ('||nrel||' relaciones): OK'||E'\n';
        ELSE
          r := r || n||') '||x||': '||xx||' alcanza filas ajenas en '||array_length(lst,1)||' relaciones: '||left(array_to_string(lst, ', '),900)||': FALLA'||E'\n';
          IF x <> 'super_admin SIN aal2' AND left(xx,3) IN ('SEL','MAR') THEN FOREACH ln IN ARRAY lst LOOP leaky := leaky||'|'||split_part(ln,' ',1)||'|'; END LOOP; END IF;
        END IF;
      END;
    END LOOP;
    IF coalesce(array_length(i_ins,1),0) > 0 THEN
      r := r || 'AVISO: '||x||': INSERT de fila ajena rechazado por constraint (no por RLS), no concluyente: '||left(array_to_string(i_ins, '; '),500)||E'\n';
    END IF;
    IF coalesce(array_length(i_other,1),0) > 0 THEN
      r := r || 'AVISO: '||x||': errores inesperados (no son permiso denegado): '||left(array_to_string(i_other, '; '), 700)||E'\n';
    END IF;

    -- (E) Escalada sobre el propio perfil: nadie puede cambiarse role / restaurant_id / active (se mide el ESTADO final, no el error)
    IF (ac->'claims') ? 'sub' THEN
      o_esc := '{}'; uid_ := (ac->'claims'->>'sub')::uuid;
      FOREACH xx IN ARRAY ARRAY['role=super_admin','role=admin','restaurant_id=B','active=true'] LOOP
        SELECT to_jsonb(p) INTO rowj FROM public.profiles p WHERE p.id = uid_;
        CONTINUE WHEN (xx = 'role=super_admin' AND rowj->>'role' = 'super_admin') OR (xx = 'role=admin' AND rowj->>'role' = 'admin')
                   OR (xx = 'active=true' AND rowj->>'active' = 'true');
        sqltxt := CASE xx WHEN 'role=super_admin' THEN 'UPDATE public.profiles SET role = ''super_admin'' WHERE id = auth.uid()'
                          WHEN 'role=admin' THEN 'UPDATE public.profiles SET role = ''admin'' WHERE id = auth.uid()'
                          WHEN 'restaurant_id=B' THEN format('UPDATE public.profiles SET restaurant_id = %L WHERE id = auth.uid()', rb)
                          ELSE 'UPDATE public.profiles SET active = true WHERE id = auth.uid()' END;
        changed := false;
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
          EXECUTE sqltxt;
          RESET ROLE;
          SELECT to_jsonb(p) INTO rowj2 FROM public.profiles p WHERE p.id = uid_;
          changed := (rowj2->>split_part(xx,'=',1)) IS DISTINCT FROM (rowj->>split_part(xx,'=',1));
          RAISE EXCEPTION 'undo' USING ERRCODE = 'P9999';
        EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
        IF changed THEN o_esc := array_append(o_esc, xx); END IF;
      END LOOP;
      n := n + 1;
      IF coalesce(array_length(o_esc,1),0) = 0 THEN r := r || n||') '||x||': no puede escalar su propio perfil (role / restaurant_id / active): OK'||E'\n';
      ELSE r := r || n||') '||x||': SE ESCALA el propio perfil con UPDATE directo ('||array_to_string(o_esc, ', ')||'): FALLA'||E'\n'; END IF;
    END IF;
    -- (F) Integridad de pedidos: el personal no reescribe total / items / paid_at por UPDATE directo (solo avanza el estado)
    IF (ac->>'k') IN ('admin A','cashier A','waiter A','kitchen A') AND seedpk ? 'orders|A' THEN
      o_esc := '{}';
      FOREACH xx IN ARRAY ARRAY['total','items','paid_at'] LOOP
        EXECUTE format('SELECT to_jsonb(o) FROM public.orders o WHERE o.id = %L', seedpk->>'orders|A') INTO rowj;
        sqltxt := CASE xx WHEN 'total' THEN 'total = 0' WHEN 'items' THEN 'items = ''[]''::jsonb' ELSE 'paid_at = now()' END;
        changed := false;
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
          EXECUTE format('UPDATE public.orders SET %s WHERE id = %L', sqltxt, seedpk->>'orders|A');
          RESET ROLE;
          EXECUTE format('SELECT to_jsonb(o) FROM public.orders o WHERE o.id = %L', seedpk->>'orders|A') INTO rowj2;
          changed := (rowj2->>xx) IS DISTINCT FROM (rowj->>xx);
          RAISE EXCEPTION 'undo' USING ERRCODE = 'P9999';
        EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
        IF changed THEN o_esc := array_append(o_esc, xx); END IF;
      END LOOP;
      n := n + 1;
      IF coalesce(array_length(o_esc,1),0) = 0 THEN r := r || n||') '||x||': no puede reescribir total/items/paid_at de un pedido con UPDATE directo: OK'||E'\n';
      ELSE r := r || n||') '||x||': REESCRIBE pedidos con UPDATE directo ('||array_to_string(o_esc, ', ')||'): FALLA'||E'\n'; END IF;
    END IF;
    -- (G) Datos de cobro / suscripcion (JSON del proveedor de pagos): el personal que no es admin no los lee ni de su propio restaurante
    IF (ac->>'k') IN ('cashier A','waiter A','kitchen A') THEN
      o_esc := '{}';
      FOREACH xx IN ARRAY ARRAY['payments','subscriptions','restaurant_payment_config'] LOOP
        CONTINUE WHEN NOT (rels @> jsonb_build_array(jsonb_build_object('n',xx)) OR EXISTS (SELECT 1 FROM jsonb_array_elements(rels) e WHERE e->>'n' = xx));
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
          EXECUTE format('SELECT count(*) FROM public.%I WHERE restaurant_id = %L', xx, ra) INTO cnt;
          RESET ROLE;
          IF cnt > 0 THEN o_esc := array_append(o_esc, xx||' ('||cnt||')'); END IF;
        EXCEPTION WHEN OTHERS THEN RESET ROLE; END;
      END LOOP;
      n := n + 1;
      IF coalesce(array_length(o_esc,1),0) = 0 THEN r := r || n||') '||x||': no lee pagos / suscripcion / config de pagos de su restaurante (solo admin): OK'||E'\n';
      ELSE r := r || n||') '||x||': LEE datos de cobro reservados al admin: '||array_to_string(o_esc, ', ')||': FALLA'||E'\n'; END IF;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------------------------------------------
  -- 3b. Privilegios de tabla peligrosos (saltan o debilitan RLS)
  ---------------------------------------------------------------------------------------------------------------
  SELECT string_agg(c.relname||'('||g.rol||')', ', ' ORDER BY c.relname) INTO x
    FROM pg_class c CROSS JOIN (VALUES ('anon'),('authenticated')) g(rol)
    WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND has_table_privilege(g.rol, c.oid, 'TRUNCATE');
  n := n + 1;
  r := r || n||') ni anon ni authenticated tienen TRUNCATE en tablas de public (TRUNCATE salta RLS y vacia todos los restaurantes): '||
       CASE WHEN x IS NULL THEN 'OK' ELSE 'FALLA ('||left(x,600)||')' END||E'\n';
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO x
    FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m')
     AND (has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'));
  n := n + 1;
  r := r || n||') anon no tiene privilegios INSERT/UPDATE/DELETE sobre ninguna tabla/vista de public (el menu publico solo usa RPC): '||
       CASE WHEN x IS NULL THEN 'OK' ELSE 'FALLA ('||left(x,600)||'; hoy solo la RLS lo frena)' END||E'\n';

  ---------------------------------------------------------------------------------------------------------------
  -- 4. Vistas: security_invoker o filtro (la fuga real ya se midio arriba por SELECT/marcadores)
  ---------------------------------------------------------------------------------------------------------------
  FOR rec IN
    SELECT c.relname::text AS nm, c.relkind::text rk, coalesce(c.reloptions::text,'') ~ 'security_invoker=(true|on)' AS inv,
      has_table_privilege('anon', c.oid, 'SELECT') AS an, has_table_privilege('authenticated', c.oid, 'SELECT') AS au
    FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('v','m') ORDER BY 1
  LOOP
    CONTINUE WHEN NOT (rec.an OR rec.au);
    n := n + 1;
    IF rec.inv THEN r := r || n||') vista '||rec.nm||' (legible por '||CASE WHEN rec.an THEN 'anon+' ELSE '' END||'authenticated) es security_invoker: OK'||E'\n';
    ELSIF wl_all ? rec.nm THEN r := r || n||') vista '||rec.nm||' no es security_invoker pero esta en la lista blanca (solo id, slug, name): OK'||E'\n';
    ELSE
      -- definer: debe filtrar. Se acepta solo si NINGUN actor vio datos de B (revisado arriba); si no, el FALLA ya salio en SELECT/MARCADORES.
      IF position('|'||rec.nm||'|' in leaky) > 0 THEN
        r := r || n||') vista '||rec.nm||' NO es security_invoker, es legible por '||CASE WHEN rec.an THEN 'anon' ELSE 'authenticated' END||' y MUESTRA filas de otro restaurante: FALLA'||E'\n';
      ELSE
        r := r || n||') vista '||rec.nm||' no es security_invoker pero filtra: ningun actor (salvo super_admin) vio filas ajenas: OK'||E'\n';
        r := r || 'AVISO: vista '||rec.nm||' corre con los permisos de su dueno; mejor convertirla en security_invoker para que dependa de RLS'||E'\n';
      END IF;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------------------------------------------
  -- 5. Funciones SECURITY DEFINER ejecutables por authenticated/anon, llamadas desde A con ids de B
  ---------------------------------------------------------------------------------------------------------------
  -- ids de B disponibles por tabla
  tabs_b := '{}';
  FOR rec IN SELECT je.key AS kk, je.value AS vv FROM jsonb_each_text(seedpk) je LOOP
    IF rec.kk LIKE '%|B' AND rec.vv IS NOT NULL THEN tabs_b := tabs_b || jsonb_build_object(split_part(rec.kk,'|',1), rec.vv); END IF;
  END LOOP;
  -- tabla -> id de B se usa como "uuid de objeto"; tokens y slug de B
  argmap := '{"p_order_id":["orders","orders#ready","orders#cooking"],"p_dish_id":["dishes"],"p_producto_id":["dishes"],"p_employee_id":["profiles"],"p_user_id":["profiles"],
   "p_payment_id":["payments","order_payments"],"p_pago_id":["order_payments","payments"],"p_restaurant_id":["restaurants"],"p_restaurant":["restaurants"],
   "p_mesa_id":["mesas"],"p_task_id":["tasks"],"p_comment_id":["comentarios_platos"],"p_parent_id":["comentarios_platos"],
   "p_ingrediente_id":["ingredientes"],"p_gasto_id":["gastos"],"p_schedule_id":["employee_schedules"],"p_checkin_id":["shift_checkins"],
   "p_vendedor":["vendedores","profiles"],"p_id":["restaurants","comisiones","feedback_items","prospectos","leads","liquidaciones","vendedores","profiles","tasks","dishes","orders"]}'::jsonb;
  -- ids de B (para detectar fugas): todas las pk sembradas de B + restaurante + usuarios de B
  b_ids := ARRAY(SELECT je2.value FROM jsonb_each_text(tabs_b) je2);
  tabs_b := tabs_b || jsonb_build_object('profiles', ubw::text);  -- los ids de empleado apuntan al mesero de B (el admin de B puede actuar sobre el)
  b_ids := b_ids || ARRAY[rb::text, ub::text, ubc::text, ubw::text, ubk::text];
  -- huella de B: hash de todas las filas de B en todas las tablas con datos de B
  snap_sql := 'SELECT md5(coalesce(string_agg(h, ''|'' ORDER BY h), '''')) FROM (' ||
    coalesce((SELECT string_agg(format('SELECT %L||md5(coalesce(string_agg(q::text, '','' ORDER BY q::text),'''')) AS h FROM public.%I q WHERE %I::text = %L',
        e->>'n', e->>'n', coalesce(e->>'tc', e->>'pk'),
        CASE WHEN e->>'tc' IS NOT NULL THEN rb::text ELSE coalesce(seedpk->>((e->>'n')||'|B'),'-') END), ' UNION ALL ')
      FROM jsonb_array_elements(rels) e WHERE e->>'k' IN ('T','C') AND (e->>'tc' IS NOT NULL OR e->>'pk' IS NOT NULL)), 'SELECT ''x''::text AS h') || ') s';

  FOR fn IN
    SELECT p.oid, p.proname::text AS nm, p.pronargs, pg_get_function_identity_arguments(p.oid) AS idargs,
      p.prorettype::regtype::text AS rt,
      string_to_array(p.proargtypes::text, ' ')::oid[] AS tys,
      (SELECT array_agg(coalesce(a.nm,'') ORDER BY a.o) FROM unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(nm, md, o) WHERE coalesce(a.md::text,'i') IN ('i','b','v')) AS nms,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS an
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef AND p.prokind='f'
      AND p.prorettype <> 'trigger'::regtype
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ORDER BY 2, 3
  LOOP
    nf_total := nf_total + 1;
    IF fn.nm = ANY (wl_pub) THEN nf_wl := nf_wl + 1; CONTINUE; END IF;
    -- (a) armar argumentos
    nargs := fn.pronargs; fnames := coalesce(fn.nms, array_fill(''::text, ARRAY[nargs])); ok_cov := true; why := '';
    variants := 1; cand := '{}';
    FOR i IN 1..nargs LOOP
      nm := fnames[i]; ty := format_type(fn.tys[i], NULL);
      IF ty = 'uuid' THEN
        IF nm = 'p_edit_token' THEN CONTINUE; END IF;
        candl := ARRAY(SELECT e FROM jsonb_array_elements_text(coalesce(argmap->nm, '[]'::jsonb)) e WHERE tabs_b ? e);
        IF coalesce(array_length(candl,1),0) = 0 THEN
          stem := regexp_replace(regexp_replace(nm,'^p_',''),'_id$','');
          candl := ARRAY(SELECT e FROM unnest(ARRAY[stem, stem||'s', stem||'es']) e WHERE tabs_b ? e);
        END IF;
        IF coalesce(array_length(candl,1),0) = 0 THEN ok_cov := false; why := why||'uuid '||nm||' sin fila de B sembrada para mapearlo; '; END IF;
        cand := cand || jsonb_build_object(nm, to_jsonb(candl));
        variants := greatest(variants, coalesce(array_length(candl,1),1));
      ELSIF ty NOT IN ('text','character varying','integer','bigint','smallint','numeric','boolean','date','jsonb','json','timestamp with time zone') THEN
        ok_cov := false; why := why||'tipo '||ty||' ('||nm||') sin generador; ';
      END IF;
    END LOOP;
    IF NOT ok_cov THEN
      nf_unc := nf_unc + 1;
      r := r || 'no cubierto automaticamente: '||fn.nm||'('||fn.idargs||') -> '||rtrim(why,'; ')||E'\n';
      CONTINUE;
    END IF;
    nf_tested := nf_tested + 1; fn_inc := '{}'; fn_heur := '{}'; fn_anyctl := false; fn_ctlerr := NULL;
    -- resultados por variante, resumidos por funcion y actor
    FOR vr IN 1..variants LOOP
      argtxt := ''; hasbobj := false; stripped := '';
      FOR i IN 1..nargs LOOP
        nm := fnames[i]; ty := format_type(fn.tys[i], NULL);
        IF ty = 'uuid' THEN
          IF nm = 'p_edit_token' THEN val := quote_literal(gen_random_uuid()::text);
          ELSE
            candl := ARRAY(SELECT jsonb_array_elements_text(cand->nm));
            lit := tabs_b->>(candl[least(vr, array_length(candl,1))]);
            val := quote_literal(lit); hasbobj := true; stripped := stripped||'|'||lit;
          END IF;
          val := val || '::uuid';
        ELSIF ty IN ('text','character varying') THEN
          val := quote_literal(CASE
            WHEN nm ~ 'email' THEN 'zz@aisl-x.test' WHEN nm ~ 'password|clave' THEN 'Clave12345x' WHEN nm = 'p_slug' THEN 'aisl-b'
            WHEN nm IN ('p_role') THEN 'waiter' WHEN nm ~ 'metodo|payment_method|medio' THEN 'efectivo' WHEN nm = 'p_status' THEN 'cooking'
            WHEN nm = 'p_tipo_pedido' THEN 'LOCAL' WHEN nm IN ('p_plan') THEN 'pro' WHEN nm ~ 'motivo|notas|notes|texto|comentario|resumen' THEN 'prueba de aislamiento'
            WHEN nm = 'p_token' THEN coalesce(seedrow->'kitchen_tv_tokens|B'->>'token', 'x') ELSE 'Prueba' END);
        ELSIF ty IN ('integer','bigint','smallint') THEN
          val := CASE WHEN nm = 'p_item_index' THEN '0' WHEN nm = 'p_rating' THEN '5' WHEN nm ~ 'dias|semanas|limite' THEN '7' ELSE '1' END;
        ELSIF ty = 'numeric' THEN val := CASE WHEN nm ~ 'recibido|paid' THEN '1000' WHEN nm ~ 'propina' THEN '0' ELSE '5' END;
        ELSIF ty = 'boolean' THEN val := 'false';
        ELSIF ty = 'date' THEN val := 'current_date';
        ELSIF ty = 'timestamp with time zone' THEN val := 'now()';
        ELSE
          val := quote_literal(CASE
            WHEN fn.nm = 'editar_items_pedido' AND nm = 'p_items' THEN '[{"idx":0,"quantity":1}]'
            WHEN nm = 'p_items' THEN '[{"id":"'||coalesce(tabs_b->>'dishes','00000000-0000-0000-0000-000000000000')||'","quantity":1}]'
            WHEN nm ~ 'filas|lineas|custom|items' THEN '[]' ELSE '{}' END)||'::'||ty;
          IF ty IN ('text','character varying') THEN NULL; END IF;
        END IF;
        IF ty IN ('integer','bigint','smallint','numeric','boolean') THEN val := val||'::'||ty; END IF;
        IF ty = 'text' OR ty = 'character varying' THEN val := val||'::text'; END IF;
        argtxt := argtxt || CASE WHEN i>1 THEN ', ' ELSE '' END || val;
      END LOOP;
      callsql := format('SELECT string_agg(q::text, E''\n'') FROM public.%I(%s) q', fn.nm, argtxt);
      -- (b) ejecutar como controles (dueno de B) y como cada actor; cada ejecucion se deshace
      ctl_ok := false; ctl_err := NULL; res := '{}';
      FOR ct IN SELECT value FROM jsonb_array_elements(ctls || actors) LOOP
        err := NULL; st := NULL; outt := NULL; changed := false;
        BEGIN
          RESET ROLE;
          EXECUTE snap_sql INTO b_before;
          PERFORM set_config('request.jwt.claims', (ct->'claims')::text, true);
          EXECUTE format('SET LOCAL ROLE %I', ct->>'db');
          EXECUTE callsql INTO outt;
          RESET ROLE;
          EXECUTE snap_sql INTO b_after;
          changed := b_before IS DISTINCT FROM b_after;
          RAISE EXCEPTION 'undo' USING ERRCODE = 'P9999';
        EXCEPTION WHEN OTHERS THEN
          RESET ROLE;
          IF SQLSTATE <> 'P9999' THEN err := left(replace(SQLERRM,E'\n',' '),120); st := SQLSTATE; END IF;
        END;
        res := res || jsonb_build_object(ct->>'k', jsonb_build_object('err',err,'st',st,'out',left(coalesce(outt,''),20000),'changed',changed));
        IF (ct->>'k') IN ('admin B','cashier B','waiter B','kitchen B','super_admin aal2') AND err IS NULL THEN ctl_ok := true; END IF;
        IF (ct->>'k') = 'anon' AND err IS NULL AND NOT (ct ? 'forbid') THEN ctl_ok := true; END IF;
        IF err IS NOT NULL AND ctl_err IS NULL AND NOT (ct ? 'forbid') THEN ctl_err := err; END IF;
      END LOOP;
      -- (c) veredicto por actor
      IF ctl_ok THEN fn_anyctl := true; ELSIF fn_ctlerr IS NULL THEN fn_ctlerr := ctl_err; END IF;
      FOR ac IN SELECT value FROM jsonb_array_elements(actors) LOOP
        x := ac->>'k'; err := res->x->>'err'; st := res->x->>'st'; outt := res->x->>'out'; changed := (res->x->>'changed')::boolean;
        -- el anon "control" y el anon "actor" comparten nombre: el actor se evalua con su propia ejecucion (la ultima gana en res)
        IF changed THEN
          IF fn.nm = ANY (wl_cap) THEN fl_cap := array_append(fl_cap, x||' / '||fn.nm||' (cambia)');
          ELSE fl_fal := array_append(fl_fal, x||'|CAMBIA datos de B|'||fn.nm||'('||fn.idargs||')'); END IF;
          CONTINUE;
        END IF;
        IF err IS NULL THEN
          -- fuga: textos sembrados de B o ids de B que no se pasaron como argumento
          leak := position('seedb_' in outt) > 0 OR (position('seeda_' in outt) > 0 AND (ac->'forbid') @> to_jsonb(ra));
          FOREACH lit IN ARRAY b_ids LOOP
            IF position(lit in argtxt) = 0 AND position(lit in outt) > 0 THEN leak := true; END IF;
          END LOOP;
          IF leak THEN
            IF fn.nm = ANY (wl_cap) THEN fl_cap := array_append(fl_cap, x||' / '||fn.nm||' (lee)');
            ELSE fl_fal := array_append(fl_fal, x||'|DEVUELVE datos de un restaurante prohibido|'||fn.nm||'('||fn.idargs||')'); END IF;
          ELSIF hasbobj AND coalesce(outt,'') NOT IN ('','null','{}','[]') THEN
            -- Respondio sin error con un id de B. Es fuga solo si la respuesta se DISTINGUE de la que da por un id inexistente.
            ph_out := NULL; ph_err := NULL;
            BEGIN
              RESET ROLE;
              PERFORM set_config('request.jwt.claims', (ac->'claims')::text, true);
              EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
              EXECUTE phsql INTO ph_out;
              RESET ROLE;
              RAISE EXCEPTION 'undo' USING ERRCODE = 'P9999';
            EXCEPTION WHEN OTHERS THEN RESET ROLE; IF SQLSTATE <> 'P9999' THEN ph_err := SQLERRM; END IF; END;
            IF ph_err IS NULL AND regexp_replace(regexp_replace(coalesce(ph_out,''),'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','<u>','g'),'[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9:.]+([+-][0-9:]+|Z)?','<t>','g')
               = regexp_replace(regexp_replace(coalesce(outt,''),'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}','<u>','g'),'[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9:.]+([+-][0-9:]+|Z)?','<t>','g') THEN
              NULL;  -- indistinguible de un id inexistente: no filtra nada
            ELSIF fn.nm = ANY (wl_cap) THEN fl_cap := array_append(fl_cap, x||' / '||fn.nm||' (responde)');
            ELSE fl_fal := array_append(fl_fal, x||'|RESPONDE distinto que ante un id inexistente (dato de B o id de B aceptado)|'||fn.nm||'('||fn.idargs||') -> '||left(regexp_replace(outt,'\s+',' ','g'),50)); END IF;
          END IF;
        ELSIF st = '42501' OR ctl_ok THEN NULL;  -- rechazada: por permiso o con control positivo valido
        ELSIF err ~* '(no autorizado|no encontrad|no pertenece|permiso|solo (el )?admin|se requiere|acceso denegado|not authorized|permission denied|verifica tu c|inactiv)' THEN
          fn_heur := array_append(fn_heur, fn.nm);  -- rechazo por mensaje de autorizacion (heuristico, sin control positivo)
        ELSE fn_inc := array_append(fn_inc, x||' / '||fn.nm||' ('||left(err,50)||')');
        END IF;
      END LOOP;
    END LOOP;
    IF NOT fn_anyctl THEN
      fl_inc := fl_inc || fn_inc; fl_heur := fl_heur || fn_heur;
      fl_noctl := array_append(fl_noctl, fn.nm||' ['||left(coalesce(fn_ctlerr,'?'),70)||']');
    END IF;
  END LOOP;
  -- informe de funciones
  n := n + 1;
  r := r || n||') funciones SECURITY DEFINER ejecutables por authenticated/anon: '||nf_total||' en total; '||nf_tested||' probadas con ids de B; '||nf_wl||
       ' publicas por diseno (lista blanca, no se juzgan: '||array_to_string(wl_pub, ', ')||'); '||nf_unc||' no cubiertas automaticamente: '||
       CASE WHEN nf_unc = 0 THEN 'OK' ELSE 'AVISO (ver lineas "no cubierto automaticamente")' END||E'\n';
  IF coalesce(array_length(fl_fal,1),0) = 0 THEN
    n := n + 1; r := r || n||') ninguna funcion SECURITY DEFINER probada devuelve ni cambia datos de B para ningun actor: OK'||E'\n';
  ELSE
    FOR rec IN SELECT split_part(v,'|',1) AS actor, split_part(v,'|',2) AS kind, string_agg(DISTINCT split_part(v,'|',3), ', ') AS fns, count(DISTINCT split_part(v,'|',3)) AS nfn
               FROM unnest(fl_fal) v GROUP BY 1,2 ORDER BY 1,2 LOOP
      n := n + 1; r := r || n||') funciones SECURITY DEFINER desde '||rec.actor||' con ids de B ('||rec.nfn||'): '||rec.kind||' mediante '||left(rec.fns,900)||': FALLA'||E'\n';
    END LOOP;
  END IF;
  IF coalesce(array_length(fl_heur,1),0) > 0 THEN
    r := r || 'INFO: rechazos aceptados por el texto del error (mensaje de autorizacion), sin control positivo: '||left((SELECT string_agg(DISTINCT v, ', ') FROM unnest(fl_heur) v),1200)||E'\n';
  END IF;
  IF coalesce(array_length(fl_cap,1),0) > 0 THEN
    r := r || 'AVISO: capacidad por uuid de pedido (QUIEN TENGA el uuid de un pedido de B lo consulta/edita/cancela, sea anon o personal de A; aceptado solo mientras el uuid sea el secreto del comensal): '||
         (SELECT string_agg(DISTINCT v, ', ') FROM unnest(fl_cap) v)||E'\n';
  END IF;
  IF coalesce(array_length(fl_avi,1),0) > 0 THEN
    r := r || 'AVISO: respondieron SIN error con un id de B (sin datos ni cambios detectables; revisar a mano): '||left((SELECT string_agg(DISTINCT v, ', ') FROM unnest(fl_avi) v),1500)||E'\n';
  END IF;
  IF coalesce(array_length(fl_noctl,1),0) > 0 THEN
    r := r || 'INFO: funciones SIN control positivo (ni el dueno de B, ni super_admin aal2, ni anon logran ejecutarlas con los argumentos generados; primer error): '||left((SELECT string_agg(DISTINCT v, '; ') FROM unnest(fl_noctl) v),4000)||E'\n';
  END IF;
  IF coalesce(array_length(fl_inc,1),0) > 0 THEN
    r := r || 'AVISO: rechazadas pero NO concluyente (ni el dueno de B ni el super_admin aal2 ni anon logran ejecutarlas con los argumentos generados; el rechazo puede ser solo validacion): '||
         left((SELECT string_agg(DISTINCT regexp_replace(v,'^[^/]*/ ','') , ', ') FROM unnest(fl_inc) v),2500)||E'\n';
  END IF;

  ---------------------------------------------------------------------------------------------------------------
  -- 6. Storage: restaurant-assets y branding
  ---------------------------------------------------------------------------------------------------------------
  IF to_regclass('storage.objects') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    r := r || 'AVISO: storage no probado (la base no tiene el esquema storage)'||E'\n';
  ELSE
    -- la replica puede no traer storage.filename / storage.foldername: se agregan como stub SOLO si faltan (se revierte)
    IF to_regprocedure('storage.filename(text)') IS NULL THEN
      EXECUTE 'CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS ''SELECT (string_to_array(name, ''''/''''))[array_length(string_to_array(name, ''''/''''), 1)]''';
      r := r || 'INFO: la base no tiene storage.filename; se uso un stub equivalente (solo en esta prueba)'||E'\n';
    END IF;
    FOREACH bk IN ARRAY ARRAY['restaurant-assets','branding'] LOOP
      SELECT count(*) INTO pol_n FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
        AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) LIKE '%'||bk||'%';
      IF pol_n = 0 THEN
        r := r || 'AVISO: storage '||bk||': no hay politicas sobre storage.objects que mencionen el bucket en esta base; pruebas de objetos de '||bk||' NO ejecutadas (storage no probado)'||E'\n';
        CONTINUE;
      END IF;
      BEGIN
        INSERT INTO storage.buckets (id, name, public) VALUES (bk, bk, true) ON CONFLICT (id) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL; END;
      -- control positivo: admin A escribe en SU carpeta; negativo: en la carpeta de B (insert / update / delete)
      FOREACH op IN ARRAY ARRAY['INSERT carpeta propia','INSERT carpeta de B','UPDATE objeto de B','DELETE objeto de B'] LOOP
        err := NULL; st := NULL; cnt := 0;
        BEGIN
          RESET ROLE;
          INSERT INTO storage.objects (bucket_id, name) VALUES (bk, rb::text||'/semilla.png');
          PERFORM set_config('request.jwt.claims', (actors->0->'claims')::text, true);
          SET LOCAL ROLE authenticated;
          IF op = 'INSERT carpeta propia' THEN INSERT INTO storage.objects (bucket_id, name) VALUES (bk, ra::text||'/prueba.png');
          ELSIF op = 'INSERT carpeta de B' THEN INSERT INTO storage.objects (bucket_id, name) VALUES (bk, rb::text||'/intruso.png');
          ELSIF op = 'UPDATE objeto de B' THEN UPDATE storage.objects SET name = name WHERE bucket_id = bk AND name LIKE rb::text||'/%';
          ELSE DELETE FROM storage.objects WHERE bucket_id = bk AND name LIKE rb::text||'/%'; END IF;
          GET DIAGNOSTICS cnt = ROW_COUNT;
          RESET ROLE;
          RAISE EXCEPTION 'undo' USING ERRCODE = 'P9999';
        EXCEPTION WHEN OTHERS THEN RESET ROLE; st := SQLSTATE; err := left(SQLERRM,80); END;
        n := n + 1;
        IF op = 'INSERT carpeta propia' THEN
          r := r || 'INFO: storage '||bk||' control positivo (admin A '||op||'): '||CASE WHEN cnt > 0 THEN 'permitido' ELSE 'rechazado ('||coalesce(err,'0 filas')||')' END||E'\n'; n := n - 1;
        ELSIF cnt > 0 THEN r := r || n||') storage '||bk||': admin A hace '||op||': FALLA (afecto '||cnt||' objetos)'||E'\n';
        ELSE r := r || n||') storage '||bk||': admin A hace '||op||' rechazado/0 filas: OK'||E'\n'; END IF;
      END LOOP;
    END LOOP;
    -- La funcion real que decide las rutas de restaurant-assets (si existe en la base)
    IF to_regprocedure('public._asset_ok(text)') IS NOT NULL THEN
      FOR ac IN SELECT value FROM jsonb_array_elements(actors) WHERE value->>'k' IN ('admin A','waiter A','cashier A','kitchen A','anon') LOOP
        FOREACH x IN ARRAY ARRAY[rb::text||'/portada.png','dishes/'||coalesce(tabs_b->>'dishes', gen_random_uuid()::text)||'.png','avatars/'||ub::text||'.png', rb::text||'/sub/carpeta/x.png'] LOOP
          ass := NULL;
          BEGIN
            PERFORM set_config('request.jwt.claims', (ac->'claims')::text, true);
            EXECUTE format('SET LOCAL ROLE %I', ac->>'db');
            ass := public._asset_ok(x);
            RESET ROLE;
          EXCEPTION WHEN OTHERS THEN RESET ROLE; ass := false; END;
          n := n + 1;
          r := r || n||') storage _asset_ok('''||regexp_replace(x,'[0-9a-f]{8}-[0-9a-f-]{27}','<id B>')||''') para '||(ac->>'k')||' es falso: '||CASE WHEN coalesce(ass,false) THEN 'FALLA' ELSE 'OK' END||E'\n';
        END LOOP;
      END LOOP;
      -- control positivo
      PERFORM set_config('request.jwt.claims', (actors->0->'claims')::text, true); SET LOCAL ROLE authenticated;
      ass := public._asset_ok(ra::text||'/portada.png'); RESET ROLE;
      r := r || 'INFO: control positivo _asset_ok: admin A en su carpeta = '||coalesce(ass::text,'null')||E'\n';
    ELSE r := r || 'AVISO: storage: no existe public._asset_ok; la regla de restaurant-assets no se pudo evaluar'||E'\n';
    END IF;
  END IF;

  ---------------------------------------------------------------------------------------------------------------
  -- 7. Resumen
  ---------------------------------------------------------------------------------------------------------------
  RESET ROLE;
  lines := string_to_array(r, E'\n');
  FOREACH ln IN ARRAY lines LOOP
    IF ln ~ '^[0-9]+\)' THEN
      IF ln ~ ': OK$' THEN n_ok := n_ok + 1; ELSIF ln ~ ': FALLA' THEN n_fail := n_fail + 1; END IF;
    ELSIF ln LIKE 'AVISO%' OR ln LIKE 'no cubierto%' THEN n_aviso := n_aviso + 1; END IF;
  END LOOP;
  r := r || 'INFO: '||n_aviso||' lineas AVISO / no cubierto automaticamente: leerlas, no cuentan como OK ni como FALLA'||E'\n';
  r := r || 'RESUMEN: '||n_ok||' OK, '||n_fail||' FALLA'||E'\n';
  RAISE EXCEPTION E'TEST_OUTPUT\n%', r;
END $$;
