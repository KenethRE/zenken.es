"""Entra en la plataforma de Aviation Group con el usuario y la contraseña que recibe,
lee «Mi Horario» de varias semanas y cierra la sesión.

La contraseña solo vive en memoria durante la llamada: no se guarda ni se registra.
"""
import asyncio
import datetime as dt
import re

from playwright.async_api import async_playwright, TimeoutError as PWTimeout

URL = "https://admin.aviationgroupforms.com/"
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


class CredencialesIncorrectas(Exception):
    pass


class ErrorPlataforma(Exception):
    pass


# Lee la cuadrícula del horario que está en el DOM (aunque la pestaña no esté visible).
JS_LEER = r"""
() => {
  const panel = [...document.querySelectorAll('[role=tabpanel]')]
      .find(p => p.innerText.includes('Horario combinado')) || document;
  const horas = [...panel.querySelectorAll('.sched-hour')];
  const bloque = e => e.closest('[data-testid=stHorizontalBlock]');
  const cab = [...panel.querySelectorAll('[data-testid=stHorizontalBlock]')]
      .find(b => b.innerText.includes('Lunes') && !b.querySelector('.sched-hour'));
  const titulo = (panel.innerText.match(/Horario combinado de Grado y Licencia\s*[—-]\s*(.+)/) || [])[1] || '';
  const filas = horas.map(h => {
    const cols = [...bloque(h).querySelectorAll(':scope > [data-testid=stColumn]')].slice(1);
    return {
      hora: h.innerText.trim(),
      celdas: cols.map(c => {
        const caja = c.querySelector('[data-testid=stMarkdownContainer] > div');
        if (!caja || caja.classList.contains('sched-empty')) return null;
        const lineas = caja.innerText.split('\n').map(s => s.trim()).filter(Boolean);
        if (!lineas.length || (lineas.length === 1 && lineas[0] === '-')) return null;
        return { lineas, fondo: caja.style.backgroundColor || '', texto: caja.style.color || '' };
      })
    };
  });
  return { nombre: titulo.trim(), cabecera: cab ? cab.innerText.replace(/\s+/g, ' ').trim() : '', filas };
}
"""


def lunes(fecha: dt.date) -> dt.date:
    return fecha - dt.timedelta(days=fecha.weekday())


async def _abrir_mi_horario(page):
    await page.get_by_role("tab", name=re.compile("Mi Horario")).click()
    await page.locator(".sched-hour").first.wait_for(state="visible", timeout=20000)


async def _ir_a_semana(page, fecha: dt.date):
    """Selecciona en el calendario de «Ver horario de la semana del» el día indicado."""
    await _abrir_mi_horario(page)
    campo = page.locator("[data-testid=stDateInput]").filter(
        has_text="Ver horario de la semana del").locator("[data-testid=stDateInputField]")
    await campo.click()
    etiqueta = f"lunes, {fecha.day} de {MESES[fecha.month - 1]} de {fecha.year}"
    dia = page.locator(f'[role=button][aria-label="{etiqueta}"]')
    for _ in range(3):
        if await dia.count():
            break
        await page.get_by_role("button", name="Next month").first.click()
        await page.wait_for_timeout(300)
    await dia.first.click()
    marca = f"{fecha.day:02d}/{fecha.month:02d}"
    await page.wait_for_function(
        """marca => [...document.querySelectorAll('[data-testid=stHorizontalBlock]')]
             .some(b => b.innerText.includes('Lunes') && b.innerText.includes(marca))""",
        arg=marca, timeout=20000)
    await page.wait_for_timeout(500)


def _convertir(bruto: dict) -> list[dict]:
    """Pasa la cuadrícula a una lista de clases por día (1 = lunes)."""
    clases = []
    for fila in bruto["filas"]:
        m = re.match(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", fila["hora"])
        if not m:
            continue
        ini, fin = m.groups()
        for i, celda in enumerate(fila["celdas"][:5]):
            if celda:
                clases.append({"dia": i + 1, "ini": ini.zfill(5), "fin": fin.zfill(5), **celda})
    return clases


async def obtener_horario(usuario: str, contrasena: str, semanas: int = 4, hoy: dt.date | None = None) -> dict:
    hoy = hoy or dt.date.today()
    primera = lunes(hoy + dt.timedelta(days=2)) if hoy.weekday() >= 5 else lunes(hoy)
    async with async_playwright() as p:
        navegador = await p.chromium.launch()
        try:
            ctx = await navegador.new_context(locale="es-ES", timezone_id="Europe/Madrid",
                                              viewport={"width": 1280, "height": 1000})
            page = await ctx.new_page()
            page.set_default_timeout(20000)
            await page.goto(URL, wait_until="domcontentloaded")
            await page.get_by_label("Usuario").wait_for(timeout=30000)
            await page.get_by_label("Usuario").fill(usuario)
            await page.get_by_label("Contraseña").fill(contrasena)
            await page.get_by_role("button", name="Entrar").click()

            # Espera a entrar o a que la plataforma rechace los datos
            try:
                await page.wait_for_function(
                    """() => document.body.innerText.includes('Portal del Profesor')
                         || !!document.querySelector('[data-testid=stAlertContentError], [data-testid=stAlert]')""",
                    timeout=30000)
            except PWTimeout:
                raise ErrorPlataforma("La plataforma no ha respondido a tiempo.")
            if not await page.get_by_text("Portal del Profesor").count():
                raise CredencialesIncorrectas()

            try:
                await _abrir_mi_horario(page)
            except PWTimeout:
                raise ErrorPlataforma("No se ha encontrado «Mi Horario» en esta cuenta.")

            resultado = {"nombre": "", "semanas": {}}
            for i in range(semanas):
                fecha = primera + dt.timedelta(weeks=i)
                if i > 0:
                    try:
                        await _ir_a_semana(page, fecha)
                    except PWTimeout:
                        break  # nos quedamos con las semanas ya leídas
                bruto = await page.evaluate(JS_LEER)
                resultado["nombre"] = resultado["nombre"] or bruto["nombre"]
                resultado["semanas"][fecha.isoformat()] = _convertir(bruto)

            # Cerrar la sesión en la plataforma
            try:
                await page.get_by_role("button", name=re.compile("Cerrar Sesi")).first.click(timeout=5000)
                await page.wait_for_timeout(1000)
            except Exception:
                pass
            return resultado
        finally:
            await navegador.close()


if __name__ == "__main__":  # prueba manual: python extractor.py usuario  (pide la contraseña)
    import getpass, json, sys
    datos = asyncio.run(obtener_horario(sys.argv[1], getpass.getpass("Contraseña: ")))
    print(json.dumps(datos, ensure_ascii=False, indent=1))
