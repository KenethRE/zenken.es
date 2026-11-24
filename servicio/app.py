"""Servicio de importación de horarios para zenken.es/horario.

POST /horario/api/importar  {usuario, contrasena}  -> {id}
GET  /horario/api/h/{id}                           -> horario guardado

La contraseña se usa una sola vez para leer el horario y se descarta: no se guarda,
no se registra y no sale de la memoria del proceso. Lo único que se guarda es el
horario (nombre del profesor y sus clases) bajo un identificador aleatorio.
"""
import asyncio
import datetime as dt
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from extractor import CredencialesIncorrectas, ErrorPlataforma, obtener_horario

DATOS = Path(os.environ.get("HORARIO_DATOS", "./datos"))
SEMANAS = int(os.environ.get("HORARIO_SEMANAS", "4"))
(DATOS / "h").mkdir(parents=True, exist_ok=True)

log = logging.getLogger("horario")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _secreto() -> bytes:
    f = DATOS / "secreto"
    if not f.exists():
        f.write_bytes(secrets.token_bytes(32))
        f.chmod(0o600)
    return f.read_bytes()


SECRETO = _secreto()
INDICE = DATOS / "indice.json"  # huella del usuario -> id (para que el enlace no cambie al actualizar)

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
turno = asyncio.Semaphore(1)        # un navegador cada vez (el servidor es pequeño)
en_cola = 0
MAX_COLA = 4
intentos: dict[str, deque] = defaultdict(deque)
LIMITE, VENTANA = 5, 600            # 5 importaciones cada 10 min por IP
ID_OK = re.compile(r"^[A-Za-z0-9_-]{16,40}$")


class Peticion(BaseModel):
    usuario: str = Field(min_length=1, max_length=100)
    contrasena: str = Field(min_length=1, max_length=200)


def _huella(usuario: str) -> str:
    return hmac.new(SECRETO, usuario.strip().lower().encode(), hashlib.sha256).hexdigest()


def _leer_indice() -> dict:
    try:
        return json.loads(INDICE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _guardar_json(ruta: Path, datos) -> None:
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False))
    tmp.replace(ruta)


def _ip(req: Request) -> str:
    return req.headers.get("x-real-ip") or (req.client.host if req.client else "?")


@app.post("/horario/api/importar")
async def importar(p: Peticion, req: Request):
    global en_cola
    ip = _ip(req)
    ahora = time.time()
    q = intentos[ip]
    while q and ahora - q[0] > VENTANA:
        q.popleft()
    if len(q) >= LIMITE:
        raise HTTPException(429, "Demasiados intentos. Espera unos minutos.")
    q.append(ahora)
    if en_cola >= MAX_COLA:
        raise HTTPException(503, "Hay varias importaciones en marcha. Prueba en un minuto.")

    huella = _huella(p.usuario)
    en_cola += 1
    try:
        async with turno:
            datos = await asyncio.wait_for(obtener_horario(p.usuario.strip(), p.contrasena, SEMANAS), 180)
    except CredencialesIncorrectas:
        raise HTTPException(401, "Usuario o contraseña incorrectos.")
    except (ErrorPlataforma, asyncio.TimeoutError) as e:
        log.warning("fallo de plataforma: %s", type(e).__name__)
        raise HTTPException(502, str(e) or "La plataforma no ha respondido a tiempo.")
    except Exception:
        log.exception("error inesperado al importar")
        raise HTTPException(500, "No se ha podido leer el horario.")
    finally:
        en_cola -= 1
        del p  # no conservar la contraseña más de lo necesario

    if not any(datos["semanas"].values()):
        raise HTTPException(422, "La cuenta no tiene clases en las próximas semanas.")

    return JSONResponse(_guardar(datos, huella))


def _guardar(datos: dict, huella: str | None) -> dict:
    indice = _leer_indice()
    ident = indice.get(huella) if huella else None
    if not ident:
        ident = secrets.token_urlsafe(16)
        if huella:
            indice[huella] = ident
            _guardar_json(INDICE, indice)
    registro = {
        "nombre": datos["nombre"],
        "actualizado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "semanas": datos["semanas"],
    }
    _guardar_json(DATOS / "h" / f"{ident}.json", registro)
    log.info("horario importado (%d semanas)", len(datos["semanas"]))
    return {"id": ident}


@app.get("/horario/api/h/{ident}")
async def ver(ident: str):
    if not ID_OK.match(ident):
        raise HTTPException(404, "No existe.")
    f = DATOS / "h" / f"{ident}.json"
    if not f.exists():
        raise HTTPException(404, "No existe.")
    return JSONResponse(json.loads(f.read_text()), headers={"Cache-Control": "no-store"})


@app.delete("/horario/api/h/{ident}")
async def borrar(ident: str):
    """Quien tenga el enlace puede borrar su horario."""
    if not ID_OK.match(ident):
        raise HTTPException(404, "No existe.")
    f = DATOS / "h" / f"{ident}.json"
    f.unlink(missing_ok=True)
    indice = {k: v for k, v in _leer_indice().items() if v != ident}
    _guardar_json(INDICE, indice)
    return {"ok": True}


# Solo para pruebas en local: servir también la web estática (en el servidor lo hace nginx)
if os.environ.get("HORARIO_ESTATICO"):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=os.environ["HORARIO_ESTATICO"], html=True), name="web")
