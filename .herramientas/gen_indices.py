"""Genera simuladores/index.html y el índice de cada módulo a partir de las páginas que hay en cada carpeta.

Uso:  python3 .herramientas/gen_indices.py      (desde la raíz del repositorio)

Título y subtítulo salen del <h1> y del <p class="sub"> de cada página; la descripción, de
<meta name="description">. Las páginas se agrupan por UD según el prefijo udN- del nombre del archivo.
"""
import html
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent / "simuladores"
GM = "Grado medio · Técnico en Montaje de Estructuras e Instalación de Sistemas Aeronáuticos"
GS = "Grado superior · Técnico Superior en Mantenimiento Aeromecánico de Aviones con Motor de Turbina"

MODULOS = {
    "1444": {
        "nombre": "Instalaciones eléctricas y electrónicas", "ciclo": GM,
        "ud": {1: "Fundamentos de electricidad y electrónica", 2: "Montaje de circuitos eléctricos y electrónicos",
               3: "Montaje e instalación de cableado", 4: "Montaje de módulos de control",
               5: "Medidas y verificación de las instalaciones", 6: "PRL y protección ambiental"},
    },
    "1425": {
        "nombre": "Fundamentos de electricidad", "ciclo": GS,
        "ud": {1: "Teoría de los electrones", 2: "Electricidad estática y conducción", 3: "Terminología eléctrica",
               4: "Generación de electricidad"},
    },
    "1426": {
        "nombre": "Fundamentos de electrónica en aeromecánica", "ciclo": GS,
        "ud": {1: "Diodos y tiristores", 2: "Transistores", 3: "Circuitos integrados", 4: "Placas de circuito impreso",
               5: "Servomecanismos"},
    },
    "1428": {
        "nombre": "Técnicas digitales y sistemas de instrumentos electrónicos en aeromecánica", "ciclo": GS,
        "ud": {1: "Sistemas e instrumentos electrónicos", 2: "Sistemas de numeración", 3: "Conversión de datos",
               4: "Buses de datos", 5: "Circuitos lógicos", 6: "Estructura de un ordenador", 7: "Fibra óptica",
               8: "Indicadores visuales electrónicos", 9: "Dispositivos sensibles a cargas electrostáticas",
               10: "Control de gestión del software", 11: "Entorno electromagnético",
               12: "Sistemas típicos electrónicos digitales en aeronaves"},
    },
}

CABEZA = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>{titulo}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="{css}">
</head>
<body>
<header class="banda">
  <div class="dentro">
{migas}    <h1>{h1}</h1>
    <p class="sub">{sub}</p>
  </div>
</header>
<main class="contenido">
"""
PIE = """</main>
<footer class="pie">{pie}</footer>
</body>
</html>
"""
e = html.escape


def leer(pagina):
    s = pagina.read_text(encoding="utf-8")
    texto = lambda m: re.sub(r"<[^>]+>", "", html.unescape(m.group(1))).strip() if m else ""
    h1 = texto(re.search(r"<h1[^>]*>(.*?)</h1>", s, re.S)) or texto(re.search(r"<title>(.*?)</title>", s, re.S))
    sub = texto(re.search(r'<p class="sub">(.*?)</p>', s, re.S))
    desc = re.search(r'<meta name="description" content="([^"]*)"', s)
    return h1, sub, html.unescape(desc.group(1)) if desc else ""


def ficha(href, titulo, tag, desc):
    return (f'    <a class="ficha" href="{e(href)}"><span class="tag">{e(tag)}</span>'
            f'<span class="t">{e(titulo)}</span><span class="d">{e(desc)}</span></a>\n')


def indice_modulo(cod, m):
    carpeta = RAIZ / cod
    paginas = sorted(p for p in carpeta.glob("*.html") if p.name != "index.html")
    grupos = {}
    for p in paginas:
        ud = re.match(r"ud(\d+)-", p.name)
        grupos.setdefault(int(ud.group(1)) if ud else 0, []).append(p)
    out = CABEZA.format(
        titulo=f"Simuladores {cod} · {m['nombre']}", css="../comun/sim.css",
        migas='    <p class="migas"><a href="../">Simuladores</a></p>\n',
        h1=f"{cod} · {e(m['nombre'])}", sub=e(m["ciclo"]))
    out += f'  <p class="intro">{len(paginas)} simulaciones para abrir en el navegador del ordenador o del móvil, sin instalar nada. Mueve los mandos y observa qué cambia; cada página explica qué muestra y qué preguntas trabajar en clase.</p>\n'
    for ud in sorted(grupos):
        nombre = m["ud"].get(ud, "") if ud else "Otras"
        cab = f"UD{ud} <span>· {e(nombre)}</span>" if ud else "Otras simulaciones"
        out += f'  <section class="bloque-ud">\n  <h2>{cab}</h2>\n  <div class="lista">\n'
        for p in grupos[ud]:
            t, sub, desc = leer(p)
            out += ficha(p.name, t, sub or (f"UD{ud}" if ud else ""), desc)
        out += "  </div>\n  </section>\n"
    out += PIE.format(pie=f"Módulo {cod} · {e(m['nombre'])} · Simulaciones didácticas")
    (carpeta / "index.html").write_text(out, encoding="utf-8")
    return len(paginas)


def indice_general(cuentas):
    out = CABEZA.format(titulo="Simuladores · Zenken", css="comun/sim.css", migas="",
                        h1="Simuladores de electricidad y electrónica", sub="Módulos de aviónica · Aviation Group")
    out += '  <p class="intro">Simulaciones interactivas de los módulos de electricidad, electrónica y técnicas digitales. Elige tu módulo.</p>\n  <div class="lista">\n'
    for cod, m in MODULOS.items():
        if cuentas.get(cod):
            out += ficha(f"{cod}/", f"{cod} · {m['nombre']}", m["ciclo"].split(" · ")[0], f"{cuentas[cod]} simulaciones")
    out += "  </div>\n"
    out += PIE.format(pie="Material didáctico · Simulaciones para el aula")
    (RAIZ / "index.html").write_text(out, encoding="utf-8")


if __name__ == "__main__":
    cuentas = {cod: indice_modulo(cod, m) for cod, m in MODULOS.items() if (RAIZ / cod).is_dir()}
    indice_general(cuentas)
    print(cuentas)
