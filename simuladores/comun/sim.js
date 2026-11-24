/* Utilidades comunes de los simuladores de zenken.es/simuladores.
 *
 * Controles (se añaden al final de un contenedor y avisan con alCambiar):
 *   Sim.deslizador(cont, {etiqueta, min, max, valor, paso, unidad, dec, alCambiar})  → {valor, input, desactivar(bool)}
 *   Sim.opciones(cont, {titulo, etiquetas, activa, alCambiar})                        → {indice, valor}
 *   Sim.casillas(cont, {titulo, etiquetas, marcadas, alCambiar})                      → {estado(i), estados}
 *   Sim.boton(cont, texto, alPulsar, {primario})                                      → <button>
 * Dibujo:
 *   new Sim.Lienzo(cont, {proporcion, ancho, altoMax, dibujar(ctx, w, h, lienzo)})   → lienzo.pedir() redibuja
 *     · sin «ancho»: se dibuja en píxeles CSS (w = ancho real del lienzo).
 *     · con «ancho»: coordenadas lógicas (w = ancho, h = ancho · proporcion) y todo se escala.
 *     · dibujar() se llama en el siguiente fotograma (no dentro del constructor) y al cambiar el tamaño;
 *       usa su 4.º argumento (el lienzo) para crear los Ejes.
 *     · lienzo.puntero({abajo, mover, arriba}) da (x, y) en esas mismas coordenadas.
 *   new Sim.Ejes(lienzo, ctx, {rect:[x,y,w,h] en fracciones, xlim, ylim, xlabel, ylabel, titulo, xticks, yticks, fmtx, fmty})
 *     · dentro de dibujar(): ejes.marco(); ejes.linea(xs, ys, estilo); ejes.punto(x, y, estilo); ejes.hline/vline;
 *       ejes.texto(x, y, txt, estilo); ejes.area(xs, y1s, y0s, estilo); ejes.barras(xs, hs, ancho, estilo); ejes.leyenda(items)
 *     · ejes.px(x), ejes.py(y) pasan de datos a píxeles; ejes.recortar() / ejes.soltar() limitan el dibujo al área.
 * Otros: Sim.num(x, dec, unidad) → «1,50 A»; Sim.linspace(a, b, n); Sim.animar(fn(dt, t)) → {arrancar, parar, activo};
 *   Sim.C (colores); Sim.html(el, str); Sim.estado(el, texto, tipo 'ok'|'mal'|'aviso'|'info'); Sim.texto(ctx, …).
 */
(function () {
  "use strict";

  const C = {
    NAVY: "#0B1D3A", GOLD: "#F2A900", INK: "#13203A", MUTED: "#4A5872", CARD: "#F3F6FB",
    RED: "#C0392B", GREEN: "#2E8B57", BLUE: "#2F6DB5", ORANGE: "#E67E22", PURPLE: "#7D3C98",
    GRID: "rgba(19,32,58,0.12)", LINE: "#D9E0EC", WHITE: "#FFFFFF",
  };
  const FUENTE = 'Calibri, Carlito, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  // ── Números con coma decimal y espacio de millares: num(1234.5, 1, "W") → «1 234,5 W»
  function num(x, dec = 2, unidad = "") {
    if (x === null || x === undefined || Number.isNaN(x)) return ("— " + unidad).trim();
    if (!Number.isFinite(x)) return ((x > 0 ? "∞ " : "−∞ ") + unidad).trim();
    const neg = x < 0;
    let s = Math.abs(x).toFixed(dec);
    if (Number(s) === 0) { s = (0).toFixed(dec); }
    let [ent, frac] = s.split(".");
    ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    s = frac !== undefined ? ent + "," + frac : ent;
    if (neg && Number(Math.abs(x).toFixed(dec)) !== 0) s = "−" + s;
    return (s + " " + unidad).trim();
  }

  function linspace(a, b, n) {
    const r = new Array(n);
    for (let i = 0; i < n; i++) r[i] = a + (b - a) * (n === 1 ? 0 : i / (n - 1));
    return r;
  }

  function el(tag, attrs, ...hijos) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    for (const h of hijos) if (h !== null && h !== undefined) e.append(h);
    return e;
  }
  function cont$(c) { return typeof c === "string" ? document.querySelector(c) : c; }
  let _id = 0;
  const nuevoId = (p) => `${p}-${++_id}`;

  // ── Deslizador con etiqueta y valor con coma
  function deslizador(cont, o) {
    const id = nuevoId("d");
    const paso = o.paso ?? (o.max - o.min) / 200;
    const dec = o.dec ?? 1;
    const unidad = o.unidad ?? "";
    const fmt = o.formato || ((v) => num(v, dec, unidad));
    const input = el("input", { type: "range", id, min: o.min, max: o.max, step: paso, value: o.valor });
    const val = el("output", { class: "val", for: id });
    const caja = el("div", { class: "control" },
      el("div", { class: "cab" }, el("label", { class: "etq", for: id, text: o.etiqueta }), val), input);
    cont$(cont).append(caja);
    const pintar = () => { val.textContent = fmt(Number(input.value)); };
    pintar();
    input.addEventListener("input", () => { pintar(); o.alCambiar && o.alCambiar(Number(input.value)); });
    return {
      input, caja,
      get valor() { return Number(input.value); },
      set valor(v) { input.value = v; pintar(); },
      desactivar(si) { input.disabled = !!si; caja.style.opacity = si ? 0.6 : 1; },
      refrescar: pintar,
    };
  }

  // ── Botones de opción (uno solo activo)
  function opciones(cont, o) {
    const nombre = nuevoId("o");
    const caja = el("div", { class: "control", role: "radiogroup" });
    if (o.titulo) caja.append(el("p", { class: "grupo-titulo", text: o.titulo }));
    const seg = el("div", { class: "segmentos" });
    const inputs = o.etiquetas.map((t, i) => {
      const inp = el("input", { type: "radio", name: nombre, value: String(i) });
      if (i === (o.activa ?? 0)) inp.checked = true;
      inp.addEventListener("change", () => { if (inp.checked && o.alCambiar) o.alCambiar(i, t); });
      seg.append(el("label", null, inp, document.createTextNode(t)));
      return inp;
    });
    caja.append(seg);
    cont$(cont).append(caja);
    return {
      caja,
      get indice() { return inputs.findIndex((x) => x.checked); },
      set indice(i) { inputs[i].checked = true; },
      get valor() { return o.etiquetas[inputs.findIndex((x) => x.checked)]; },
    };
  }

  // ── Casillas (varias activas)
  function casillas(cont, o) {
    const caja = el("div", { class: "control" });
    if (o.titulo) caja.append(el("p", { class: "grupo-titulo", text: o.titulo }));
    const seg = el("div", { class: "segmentos" });
    const marc = o.marcadas || [];
    const inputs = o.etiquetas.map((t, i) => {
      const inp = el("input", { type: "checkbox" });
      inp.checked = !!marc[i];
      inp.addEventListener("change", () => o.alCambiar && o.alCambiar(i, inp.checked));
      seg.append(el("label", null, inp, document.createTextNode(t)));
      return inp;
    });
    caja.append(seg);
    cont$(cont).append(caja);
    return {
      caja,
      estado: (i) => inputs[i].checked,
      fijar: (i, v) => { inputs[i].checked = !!v; },
      get estados() { return inputs.map((x) => x.checked); },
    };
  }

  function boton(cont, texto, alPulsar, op = {}) {
    const b = el("button", { type: "button", class: "btn" + (op.primario ? " primario" : ""), text: texto });
    b.addEventListener("click", alPulsar);
    let fila = cont$(cont);
    if (!fila.classList.contains("botones")) {
      const ult = fila.lastElementChild;
      if (ult && ult.classList.contains("botones")) fila = ult;
      else { const f = el("div", { class: "botones" }); fila.append(f); fila = f; }
    }
    fila.append(b);
    return b;
  }

  function html(e, s) { cont$(e).innerHTML = s; }
  function estado(e, texto, tipo = "info") {
    const x = cont$(e); x.className = "estado " + tipo; x.textContent = texto;
  }

  // ── Lienzo con nitidez en pantallas de alta densidad y redibujo al cambiar de tamaño
  class Lienzo {
    constructor(cont, o = {}) {
      this.o = o;
      this.proporcion = o.proporcion ?? 0.6;
      this.canvas = el("canvas");
      if (o.etiqueta) this.canvas.setAttribute("aria-label", o.etiqueta);
      this.canvas.setAttribute("role", "img");
      const caja = cont$(cont);
      if (caja.classList.contains("lienzo")) caja.append(this.canvas);
      else { const w = el("div", { class: "lienzo" }, this.canvas); caja.append(w); }
      this.ctx = this.canvas.getContext("2d");
      this._pendiente = false;
      this.w = 0; this.h = 0; this.escala = 1;
      this._ro = new ResizeObserver(() => this._ajustar());
      this._ro.observe(this.canvas.parentElement);
      this._ajustar();
    }
    _ajustar() {
      const cssW = Math.max(50, this.canvas.parentElement.clientWidth);
      let cssH = cssW * this.proporcion;
      if (this.o.altoMax) cssH = Math.min(cssH, this.o.altoMax);
      if (this.o.altoMin) cssH = Math.max(cssH, this.o.altoMin);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.canvas.style.height = cssH + "px";
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
      if (this.o.ancho) {
        this.escala = cssW / this.o.ancho;
        this.w = this.o.ancho; this.h = this.o.ancho * (cssH / cssW);
      } else { this.escala = 1; this.w = cssW; this.h = cssH; }
      this._dpr = dpr;
      this._pendiente = false;
      this.pedir(); // se dibuja en el siguiente fotograma: el código de la página ya ha terminado de preparar su estado
    }
    pedir() {
      if (this._pendiente) return;
      this._pendiente = true;
      requestAnimationFrame(() => { this._pendiente = false; this.dibujarYa(); });
    }
    dibujarYa() {
      const ctx = this.ctx;
      ctx.setTransform(this._dpr * this.escala, 0, 0, this._dpr * this.escala, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.fillStyle = this.o.fondo || C.WHITE;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.font = `14px ${FUENTE}`;
      ctx.textBaseline = "alphabetic";
      if (this.o.dibujar) this.o.dibujar(ctx, this.w, this.h, this);
    }
    coords(ev) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / this.escala, y: (ev.clientY - r.top) / this.escala };
    }
    puntero({ abajo, mover, arriba } = {}) {
      let activo = false;
      if (mover) this.canvas.style.touchAction = "none"; // arrastrar en el lienzo no debe desplazar la página
      this.canvas.addEventListener("pointerdown", (ev) => {
        activo = true; this.canvas.setPointerCapture(ev.pointerId);
        const p = this.coords(ev); abajo && abajo(p.x, p.y, ev);
      });
      this.canvas.addEventListener("pointermove", (ev) => {
        const p = this.coords(ev); mover && mover(p.x, p.y, activo, ev);
      });
      const fin = (ev) => { if (!activo) return; activo = false; const p = this.coords(ev); arriba && arriba(p.x, p.y, ev); };
      this.canvas.addEventListener("pointerup", fin);
      this.canvas.addEventListener("pointercancel", fin);
    }
  }

  // ── Texto en el lienzo: texto(ctx, "hola", x, y, {tam, color, alin:'left'|'center'|'right', base:'alphabetic'|'middle'|'top', negrita, cursiva, serif, fondo})
  function texto(ctx, s, x, y, e = {}) {
    ctx.save();
    ctx.font = `${e.cursiva ? "italic " : ""}${e.negrita ? "bold " : ""}${e.tam || 14}px ${e.serif ? 'Cambria, Georgia, serif' : FUENTE}`;
    ctx.textAlign = e.alin || "left";
    ctx.textBaseline = e.base || "alphabetic";
    const lineas = String(s).split("\n");
    const lh = (e.tam || 14) * (e.interlinea || 1.25);
    if (e.fondo) {
      const anchoMax = Math.max(...lineas.map((l) => ctx.measureText(l).width));
      const pad = e.pad ?? 4;
      let x0 = x - pad;
      if (ctx.textAlign === "center") x0 = x - anchoMax / 2 - pad;
      else if (ctx.textAlign === "right") x0 = x - anchoMax - pad;
      let y0 = y - (e.tam || 14) - pad + 3;
      if (ctx.textBaseline === "middle") y0 = y - (e.tam || 14) / 2 - pad;
      if (ctx.textBaseline === "top") y0 = y - pad;
      ctx.fillStyle = e.fondo;
      ctx.fillRect(x0, y0, anchoMax + 2 * pad, lh * (lineas.length - 1) + (e.tam || 14) + 2 * pad);
    }
    ctx.fillStyle = e.color || C.INK;
    lineas.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
    ctx.restore();
  }

  function trazo(ctx, est = {}) {
    ctx.strokeStyle = est.color || C.NAVY;
    ctx.lineWidth = est.ancho ?? 2.5;
    ctx.setLineDash(est.guion === true ? [7, 5] : est.guion === "punto" ? [2, 4] : est.guion || []);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.globalAlpha = est.alfa ?? 1;
  }

  function marcaEje(v, rango) {
    const a = Math.abs(rango);
    let dec = 0;
    if (a < 0.05) dec = 3; else if (a < 0.5) dec = 2; else if (a < 5) dec = 1;
    if (Number.isInteger(+v.toFixed(6))) dec = 0;
    return num(v, dec);
  }
  function marcasBonitas(a, b, n = 6) {
    const rango = b - a;
    if (!(rango > 0)) return [a];
    const bruto = rango / n;
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const f = bruto / mag;
    const paso = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    const r = [];
    for (let v = Math.ceil(a / paso - 1e-9) * paso; v <= b + paso * 1e-6; v += paso) r.push(Math.abs(v) < paso * 1e-9 ? 0 : v);
    return r;
  }
  function marcasLog(a, b) {
    const r = [];
    for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) { const v = Math.pow(10, e); if (v >= a * 0.999 && v <= b * 1.001) r.push(v); }
    return r;
  }

  // ── Ejes cartesianos dentro de un lienzo
  class Ejes {
    constructor(lienzo, ctx, o) {
      this.L = lienzo; this.ctx = ctx; this.o = o;
      const [fx, fy, fw, fh] = o.rect || [0, 0, 1, 1];
      const m = Object.assign({ izq: 62, der: 16, arr: o.titulo ? 34 : 14, aba: o.xlabel ? 52 : 34 }, o.margen || {});
      this.x0 = lienzo.w * fx + m.izq;
      this.y0 = lienzo.h * fy + m.arr;
      this.ancho = Math.max(10, lienzo.w * fw - m.izq - m.der);
      this.alto = Math.max(10, lienzo.h * fh - m.arr - m.aba);
      this.xlim = o.xlim; this.ylim = o.ylim;
      this.logx = !!o.logx; this.logy = !!o.logy;
    }
    px(x) {
      const [a, b] = this.xlim;
      const t = this.logx ? (Math.log10(x) - Math.log10(a)) / (Math.log10(b) - Math.log10(a)) : (x - a) / (b - a);
      return this.x0 + t * this.ancho;
    }
    py(y) {
      const [a, b] = this.ylim;
      const t = this.logy ? (Math.log10(y) - Math.log10(a)) / (Math.log10(b) - Math.log10(a)) : (y - a) / (b - a);
      return this.y0 + this.alto - t * this.alto;
    }
    datoX(px) { const [a, b] = this.xlim; const t = (px - this.x0) / this.ancho; return this.logx ? Math.pow(10, Math.log10(a) + t * (Math.log10(b) - Math.log10(a))) : a + t * (b - a); }
    datoY(py) { const [a, b] = this.ylim; const t = (this.y0 + this.alto - py) / this.alto; return this.logy ? Math.pow(10, Math.log10(a) + t * (Math.log10(b) - Math.log10(a))) : a + t * (b - a); }
    dentro(px, py) { return px >= this.x0 && px <= this.x0 + this.ancho && py >= this.y0 && py <= this.y0 + this.alto; }
    marco() {
      const ctx = this.ctx, o = this.o;
      const tam = o.tam || 13;
      const xt = o.xticks || (this.logx ? marcasLog(...this.xlim) : marcasBonitas(...this.xlim, o.nx || Math.max(3, Math.round(this.ancho / 90))));
      const yt = o.yticks || (this.logy ? marcasLog(...this.ylim) : marcasBonitas(...this.ylim, o.ny || Math.max(3, Math.round(this.alto / 55))));
      const fx = o.fmtx || ((v) => marcaEje(v, this.xlim[1] - this.xlim[0]));
      const fy = o.fmty || ((v) => marcaEje(v, this.ylim[1] - this.ylim[0]));
      ctx.save();
      ctx.fillStyle = o.fondo || C.WHITE;
      ctx.fillRect(this.x0, this.y0, this.ancho, this.alto);
      ctx.lineWidth = 1; ctx.strokeStyle = C.GRID; ctx.setLineDash([]);
      ctx.beginPath();
      if (o.rejilla !== false) {
        for (const v of xt) { const x = Math.round(this.px(v)) + 0.5; ctx.moveTo(x, this.y0); ctx.lineTo(x, this.y0 + this.alto); }
        for (const v of yt) { const y = Math.round(this.py(v)) + 0.5; ctx.moveTo(this.x0, y); ctx.lineTo(this.x0 + this.ancho, y); }
      }
      ctx.stroke();
      ctx.strokeStyle = C.MUTED; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(this.x0, this.y0); ctx.lineTo(this.x0, this.y0 + this.alto); ctx.lineTo(this.x0 + this.ancho, this.y0 + this.alto);
      ctx.stroke();
      if (o.cero && this.ylim[0] < 0 && this.ylim[1] > 0) {
        ctx.strokeStyle = C.MUTED; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(this.x0, this.py(0)); ctx.lineTo(this.x0 + this.ancho, this.py(0)); ctx.stroke();
      }
      ctx.restore();
      for (const v of xt) texto(ctx, fx(v), this.px(v), this.y0 + this.alto + 6, { tam, alin: "center", base: "top", color: C.INK });
      for (const v of yt) texto(ctx, fy(v), this.x0 - 7, this.py(v), { tam, alin: "right", base: "middle", color: C.INK });
      if (o.xlabel) texto(ctx, o.xlabel, this.x0 + this.ancho / 2, this.y0 + this.alto + 26, { tam: tam + 1, alin: "center", base: "top", color: C.INK });
      if (o.ylabel) {
        ctx.save();
        ctx.translate(this.x0 - (o.margen && o.margen.izq ? o.margen.izq - 16 : 48), this.y0 + this.alto / 2);
        ctx.rotate(-Math.PI / 2);
        texto(ctx, o.ylabel, 0, 0, { tam: tam + 1, alin: "center", base: "middle", color: C.INK });
        ctx.restore();
      }
      if (o.titulo) texto(ctx, o.titulo, this.x0, this.y0 - 12, { tam: tam + 3, negrita: true, color: C.NAVY });
    }
    recortar() { const c = this.ctx; c.save(); c.beginPath(); c.rect(this.x0, this.y0, this.ancho, this.alto); c.clip(); }
    soltar() { this.ctx.restore(); }
    linea(xs, ys, est = {}) {
      const ctx = this.ctx; this.recortar(); trazo(ctx, est);
      ctx.beginPath(); let empezado = false;
      for (let i = 0; i < xs.length; i++) {
        const y = ys[i];
        if (y === null || !Number.isFinite(y)) { empezado = false; continue; }
        const X = this.px(xs[i]), Y = this.py(y);
        if (!empezado) { ctx.moveTo(X, Y); empezado = true; } else ctx.lineTo(X, Y);
      }
      ctx.stroke(); this.soltar();
    }
    escalones(xs, ys, est = {}) {
      const X = [], Y = [];
      for (let i = 0; i < xs.length; i++) { if (i > 0) { X.push(xs[i]); Y.push(ys[i - 1]); } X.push(xs[i]); Y.push(ys[i]); }
      this.linea(X, Y, est);
    }
    area(xs, y1, y0, est = {}) {
      const ctx = this.ctx; this.recortar();
      ctx.fillStyle = est.color || C.GOLD; ctx.globalAlpha = est.alfa ?? 0.25;
      ctx.beginPath();
      xs.forEach((x, i) => { const p = [this.px(x), this.py(y1[i])]; i ? ctx.lineTo(...p) : ctx.moveTo(...p); });
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(this.px(xs[i]), this.py(Array.isArray(y0) ? y0[i] : (y0 ?? 0)));
      ctx.closePath(); ctx.fill(); this.soltar();
    }
    punto(x, y, est = {}) {
      const ctx = this.ctx; ctx.save();
      ctx.globalAlpha = est.alfa ?? 1;
      ctx.beginPath(); ctx.arc(this.px(x), this.py(y), est.radio || 7, 0, 2 * Math.PI);
      ctx.fillStyle = est.color || C.GOLD; ctx.fill();
      if (est.borde !== false) { ctx.lineWidth = 2; ctx.strokeStyle = est.borde || C.NAVY; ctx.stroke(); }
      ctx.restore();
    }
    hline(y, est = {}) { if (y < Math.min(...this.ylim) || y > Math.max(...this.ylim)) return; this.linea([this.xlim[0], this.xlim[1]], [y, y], Object.assign({ ancho: 1.5 }, est)); }
    vline(x, est = {}) {
      const ctx = this.ctx; this.recortar(); trazo(ctx, Object.assign({ ancho: 1.5 }, est));
      ctx.beginPath(); ctx.moveTo(this.px(x), this.y0); ctx.lineTo(this.px(x), this.y0 + this.alto); ctx.stroke(); this.soltar();
    }
    barras(xs, hs, ancho, est = {}) {
      const ctx = this.ctx; this.recortar();
      xs.forEach((x, i) => {
        const col = Array.isArray(est.color) ? est.color[i] : (est.color || C.NAVY);
        const a = this.px(x - ancho / 2), b = this.px(x + ancho / 2);
        const base = est.base ?? 0;
        const y1 = this.py(hs[i]), y0 = this.py(base);
        ctx.fillStyle = col; ctx.globalAlpha = est.alfa ?? 1;
        ctx.fillRect(Math.min(a, b), Math.min(y0, y1), Math.abs(b - a), Math.abs(y0 - y1));
      });
      this.soltar();
    }
    texto(x, y, s, est = {}) { texto(this.ctx, s, this.px(x), this.py(y), est); }
    leyenda(items, pos = "arriba-der") {
      const ctx = this.ctx, tam = this.o.tam || 13;
      ctx.save(); ctx.font = `${tam}px ${FUENTE}`;
      const anchoT = Math.max(...items.map((i) => ctx.measureText(i.texto).width));
      const W = anchoT + 46, H = items.length * (tam + 8) + 8;
      let x = this.x0 + this.ancho - W - 8, y = this.y0 + 8;
      if (pos.includes("izq")) x = this.x0 + 8;
      if (pos.includes("abajo")) y = this.y0 + this.alto - H - 8;
      ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.strokeStyle = C.LINE; ctx.lineWidth = 1;
      ctx.fillRect(x, y, W, H); ctx.strokeRect(x + 0.5, y + 0.5, W, H);
      items.forEach((it, i) => {
        const yy = y + 4 + (tam + 8) * i + (tam + 8) / 2;
        if (it.punto) {
          ctx.beginPath(); ctx.arc(x + 20, yy, 5, 0, 2 * Math.PI); ctx.fillStyle = it.color; ctx.fill();
        } else {
          trazo(ctx, { color: it.color, ancho: it.ancho ?? 2.5, guion: it.guion });
          ctx.beginPath(); ctx.moveTo(x + 8, yy); ctx.lineTo(x + 32, yy); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
        texto(ctx, it.texto, x + 38, yy, { tam, base: "middle" });
      });
      ctx.restore();
    }
  }

  // ── Bucle de animación con dt en segundos (limitado a 0,1 s si la pestaña estaba oculta)
  function animar(fn) {
    let id = null, prev = 0, t = 0;
    const paso = (ts) => {
      const dt = prev ? Math.min(0.1, (ts - prev) / 1000) : 0;
      prev = ts; t += dt;
      if (fn(dt, t) === false) { id = null; return; }
      id = requestAnimationFrame(paso);
    };
    return {
      arrancar() { if (id === null) { prev = 0; id = requestAnimationFrame(paso); } },
      parar() { if (id !== null) cancelAnimationFrame(id); id = null; },
      get activo() { return id !== null; },
      reiniciar() { t = 0; },
    };
  }

  // Herramientas de dibujo para esquemas: flechas, rectángulos redondeados, círculos
  function flecha(ctx, x1, y1, x2, y2, est = {}) {
    ctx.save(); trazo(ctx, Object.assign({ ancho: 2 }, est));
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), L = est.punta || 10;
    ctx.setLineDash([]); ctx.fillStyle = est.color || C.NAVY;
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - L * Math.cos(a - 0.4), y2 - L * Math.sin(a - 0.4));
    ctx.lineTo(x2 - L * Math.cos(a + 0.4), y2 - L * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function caja(ctx, x, y, w, h, est = {}) {
    ctx.save(); const r = est.radio ?? 8;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    if (est.relleno) { ctx.fillStyle = est.relleno; ctx.globalAlpha = est.alfa ?? 1; ctx.fill(); ctx.globalAlpha = 1; }
    if (est.color !== null) { trazo(ctx, Object.assign({ ancho: 1.5 }, est)); ctx.globalAlpha = 1; ctx.stroke(); }
    ctx.restore();
  }
  function circulo(ctx, x, y, r, est = {}) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
    if (est.relleno) { ctx.fillStyle = est.relleno; ctx.fill(); }
    if (est.color !== null) { trazo(ctx, Object.assign({ ancho: 1.5 }, est)); ctx.globalAlpha = 1; ctx.stroke(); }
    ctx.restore();
  }
  function polilinea(ctx, pts, est = {}) {
    ctx.save(); trazo(ctx, est); ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (est.cerrar) ctx.closePath();
    if (est.relleno) { ctx.fillStyle = est.relleno; ctx.fill(); }
    ctx.stroke(); ctx.restore();
  }
  // Mezcla de color: mezcla("#ff0000", "#0000ff", 0.5)
  function mezcla(c1, c2, t) {
    const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const a = h(c1), b = h(c2);
    return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, "0")).join("");
  }

  window.Sim = { C, FUENTE, num, linspace, el, deslizador, opciones, casillas, boton, html, estado, Lienzo, Ejes, texto, trazo, flecha, caja, circulo, polilinea, mezcla, animar };
})();
