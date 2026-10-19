"""Genera supabase/seeds/plantillas_borrador.sql a partir de docs/plantillas/*.md.

Aplica las correcciones mecánicas de docs/plantillas/_REVISION.md (errores E1-E7, choques de key
entre plantillas, marcas registradas) y valida las referencias cruzadas. Las plantillas se cargan
INACTIVAS (activo = false): nada se activa sin aprobación del dueño de la plataforma.

Uso: python scripts/generar_seed_plantillas.py
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "docs" / "plantillas"
SALIDA = RAIZ / "supabase" / "seeds" / "plantillas_borrador.sql"

# Grupos a eliminar por plantilla (con su lista huérfana): E5 y E7 de la revisión
QUITAR_GRUPOS = {
    "panaderia_reposteria": {"g_con_sin_mensaje"},
    "tipica_regional": {"g_sopa_dia"},
}
QUITAR_LISTAS = {"tipica_regional": {"sopa_del_dia"}}

# E6: dos grupos con el mismo nombre en cafetería
RENOMBRAR_GRUPO = {("cafeteria", "g_tamano_corto_largo"): "Tamaño del tinto"}

# Marcas registradas o calcos de una carta (sección 6 de la revisión)
REEMPLAZOS = {
    "Oreo (cookies and cream)": "Galleta de chocolate con crema",
    "Nutella": "Crema de avellana y chocolate",
    "Pan de avena y miel": "Pan de avena",
    "Pan de mantequilla y ajo": "Pan de ajo",
    "Pan de orégano y parmesano": "Pan de hierbas y queso",
    "Krispies con chocolate": "Arroz inflado con chocolate",
    "V60": "Filtrado de cono",
    "Chemex": "Filtrado de vidrio",
    "Aeropress": "Inmersión a presión",
}


def leer(path: Path) -> dict:
    texto = path.read_text(encoding="utf-8")
    for m in re.finditer(r"```json\s*(.*?)```", texto, re.S):
        try:
            d = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(d, dict) and "key" in d and "listas" in d:
            return d
    raise SystemExit(f"{path.name}: no encontré el bloque JSON de la plantilla")


def limpiar(p: dict) -> dict:
    key = p["key"]
    quitar = QUITAR_GRUPOS.get(key, set())
    # E1-E4: un grupo no obligatorio no puede exigir mínimo
    grupos = []
    for g in p.get("grupos_tipicos", []):
        if g["id"] in quitar:
            continue
        g = dict(g)
        if not g.get("requerido") and g.get("min", 0) > 0:
            g["min"] = 0
        if (key, g["id"]) in RENOMBRAR_GRUPO:
            g["nombre"] = RENOMBRAR_GRUPO[(key, g["id"])]
        grupos.append(g)
    p["grupos_tipicos"] = grupos
    p["listas"] = [l for l in p.get("listas", []) if l["key"] not in QUITAR_LISTAS.get(key, set())]
    for plato in p.get("platos_ejemplo", []):
        plato["grupos"] = [g for g in plato.get("grupos", []) if g not in quitar]
        plato["precio"] = 0

    def fix_items(items):
        for it in items:
            it["label"] = REEMPLAZOS.get(it["label"], it["label"])

    for l in p["listas"]:
        fix_items(l.get("items", []))
    for g in p["grupos_tipicos"]:
        if "items" in g.get("fuente", {}):
            fix_items(g["fuente"]["items"])
    # Convención: valores de categoría en snake_case
    renombre = {c["value"]: c["value"].replace("-", "_") for c in p.get("categorias", [])}
    for c in p.get("categorias", []):
        c["value"] = renombre[c["value"]]
    for plato in p.get("platos_ejemplo", []):
        plato["categoria"] = renombre.get(plato["categoria"], plato["categoria"])
    return p


def validar(p: dict) -> None:
    listas = {l["key"] for l in p["listas"]}
    cats = {c["value"] for c in p["categorias"]}
    ids = {g["id"] for g in p["grupos_tipicos"]}
    nombres = [g["nombre"] for g in p["grupos_tipicos"]]
    assert len(nombres) == len(set(nombres)), f"{p['key']}: nombres de grupo repetidos"
    for g in p["grupos_tipicos"]:
        assert g["modo"] in ("single", "multi"), (p["key"], g["id"])
        assert g["min"] <= g["max"], (p["key"], g["id"])
        assert g.get("requerido") or g["min"] == 0, (p["key"], g["id"])
        if "lista" in g["fuente"]:
            assert g["fuente"]["lista"] in listas, (p["key"], g["id"], g["fuente"])
    for plato in p["platos_ejemplo"]:
        assert plato["categoria"] in cats, (p["key"], plato["nombre"])
        assert set(plato["grupos"]) <= ids, (p["key"], plato["nombre"])
        assert plato["precio"] == 0


def sufijar_choques(plantillas: list) -> list:
    """Una key de lista repetida en varias plantillas se renombra <key>_<plantilla> (contenidos distintos)."""
    veces = Counter(l["key"] for p in plantillas for l in p["listas"])
    choques = {k for k, n in veces.items() if n > 1}
    renombradas = []
    for p in plantillas:
        mapa = {l["key"]: f"{l['key']}_{p['key']}"[:60] for l in p["listas"] if l["key"] in choques}
        for l in p["listas"]:
            l["key"] = mapa.get(l["key"], l["key"])
        for g in p["grupos_tipicos"]:
            if "lista" in g["fuente"]:
                g["fuente"]["lista"] = mapa.get(g["fuente"]["lista"], g["fuente"]["lista"])
        renombradas += [(p["key"], a, b) for a, b in mapa.items()]
    return renombradas


def sql_literal(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> None:
    archivos = sorted(f for f in ENTRADA.glob("*.md") if not f.name.startswith("_"))
    plantillas = [limpiar(leer(f)) for f in archivos]
    # Preguntas para el administrador (docs/plantillas/_preguntas.json): se muestran en el asistente tras elegir el tipo
    pq = ENTRADA / "_preguntas.json"
    preguntas = json.loads(pq.read_text(encoding="utf-8")) if pq.exists() else {}
    for p in plantillas:
        p["preguntas"] = preguntas.get(p["key"], [])
    renombradas = sufijar_choques(plantillas)
    for p in plantillas:
        validar(p)
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    lineas = [
        "-- GENERADO por scripts/generar_seed_plantillas.py desde docs/plantillas/*.md (no editar a mano).",
        "-- Borradores de plantillas por tipo de negocio, INACTIVOS: nada se activa sin aprobación del dueño de la plataforma.",
        "-- Idempotente: si la plantilla ya existe (por ejemplo editada desde el panel) no se toca.",
        "",
    ]
    for p in plantillas:
        payload = {k: p[k] for k in ("categorias", "listas", "grupos_tipicos", "platos_ejemplo", "preguntas")}
        payload["fuente"] = f"docs/plantillas/{p['key']}.md"
        # La certeza y las fuentes de cada ítem quedan en el .md; a la base solo va lo que usa el motor
        for l in payload["listas"]:
            for it in l["items"]:
                it.pop("certeza", None)
                it.setdefault("precio_extra", 0)
        blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        assert "$json$" not in blob
        lineas += [
            "INSERT INTO public.restaurant_templates (key, nombre, descripcion, payload, activo, version)",
            f"VALUES ({sql_literal(p['key'])}, {sql_literal(p['nombre'])}, {sql_literal(p.get('descripcion', ''))}, $json${blob}$json$::jsonb, false, 1)",
            "ON CONFLICT (key) DO NOTHING;",
            "INSERT INTO public.restaurant_template_versions (template_key, version, nombre, descripcion, payload, nota)",
            f"SELECT key, 1, nombre, descripcion, payload, 'Borrador de investigación (revisado, sin validar con un dueño real)' FROM public.restaurant_templates WHERE key = {sql_literal(p['key'])}",
            "ON CONFLICT (template_key, version) DO NOTHING;",
            "",
        ]
    SALIDA.write_text("\n".join(lineas), encoding="utf-8")
    print(f"{len(plantillas)} plantillas -> {SALIDA.relative_to(RAIZ)}")
    for k, a, b in renombradas:
        print(f"  lista renombrada en {k}: {a} -> {b}")


if __name__ == "__main__":
    sys.exit(main())
