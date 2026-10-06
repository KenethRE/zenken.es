"""
Simulador visual de conversión Analógica -> Digital (ADC)

Instalación:
    pip install numpy matplotlib

Ejecución:
    python simulador_adc.py

Controles:
- Frecuencia señal: frecuencia de la señal analógica.
- Frecuencia muestreo: número de muestras por segundo.
- Bits ADC: resolución de cuantificación.
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider, Button

# ------------------------------------------------------------
# CONFIGURACIÓN INICIAL
# ------------------------------------------------------------
DURACION = 1.0          # segundos
AMPLITUD = 1.0          # V
VREF = 1.2              # rango del ADC: -VREF ... +VREF

F_SIGNAL_INICIAL = 3.0  # Hz
FS_INICIAL = 12.0       # Hz
BITS_INICIAL = 3

# Señal "continua" aproximada con muchos puntos para dibujarla
t_cont = np.linspace(0, DURACION, 3000)


def calcular_adc(f_signal, fs, bits):
    """Calcula señal analógica, muestras, cuantificación y códigos binarios."""

    # 1. Señal analógica
    x_cont = AMPLITUD * np.sin(2 * np.pi * f_signal * t_cont)

    # 2. Muestreo
    t_sample = np.arange(0, DURACION + 1e-12, 1 / fs)
    x_sample = AMPLITUD * np.sin(2 * np.pi * f_signal * t_sample)

    # 3. Cuantificación uniforme
    n_levels = 2 ** bits
    levels = np.linspace(-VREF, VREF, n_levels)

    # Convertimos cada muestra a un índice entre 0 y 2^bits - 1
    idx = np.rint(
        (np.clip(x_sample, -VREF, VREF) + VREF)
        / (2 * VREF)
        * (n_levels - 1)
    ).astype(int)

    x_quant = levels[idx]

    # 4. Codificación binaria
    binary = [format(i, f"0{bits}b") for i in idx]

    return x_cont, t_sample, x_sample, levels, idx, x_quant, binary


# ------------------------------------------------------------
# CREACIÓN DE LA FIGURA
# ------------------------------------------------------------
fig, axes = plt.subplots(4, 1, figsize=(13, 10))
plt.subplots_adjust(left=0.09, right=0.97, top=0.92, bottom=0.25, hspace=0.65)

ax_analog, ax_sample, ax_quant, ax_binary = axes

fig.suptitle(
    "Conversión Analógica → Digital (ADC)",
    fontsize=17,
    fontweight="bold"
)

# Panel explicativo
info_text = fig.text(
    0.50,
    0.945,
    "",
    ha="center",
    va="center",
    fontsize=10
)


def dibujar():
    f_signal = slider_signal.val
    fs = slider_fs.val
    bits = int(slider_bits.val)

    x_cont, t_sample, x_sample, levels, idx, x_quant, binary = calcular_adc(
        f_signal, fs, bits
    )

    # Limpiar gráficos
    for ax in axes:
        ax.clear()

    # --------------------------------------------------------
    # 1. SEÑAL ANALÓGICA
    # --------------------------------------------------------
    ax_analog.plot(t_cont, x_cont, linewidth=2)
    ax_analog.set_title(
        "1. Señal analógica — continua en el tiempo y en amplitud",
        loc="left",
        fontweight="bold"
    )
    ax_analog.set_ylabel("Voltaje (V)")
    ax_analog.set_xlim(0, DURACION)
    ax_analog.set_ylim(-VREF - 0.15, VREF + 0.15)
    ax_analog.grid(alpha=0.25)

    # --------------------------------------------------------
    # 2. MUESTREO
    # --------------------------------------------------------
    ax_sample.plot(t_cont, x_cont, alpha=0.35, linewidth=1.5)
    ax_sample.vlines(t_sample, 0, x_sample, alpha=0.6)
    ax_sample.scatter(t_sample, x_sample, s=45, zorder=3)

    ax_sample.set_title(
        "2. Muestreo — medimos la señal en instantes concretos",
        loc="left",
        fontweight="bold"
    )
    ax_sample.set_ylabel("Voltaje (V)")
    ax_sample.set_xlim(0, DURACION)
    ax_sample.set_ylim(-VREF - 0.15, VREF + 0.15)
    ax_sample.grid(alpha=0.25)

    # --------------------------------------------------------
    # 3. CUANTIFICACIÓN
    # --------------------------------------------------------
    for level in levels:
        ax_quant.axhline(level, alpha=0.18, linewidth=0.8)

    ax_quant.scatter(
        t_sample, x_sample,
        marker="x",
        s=50,
        label="Muestra real"
    )

    ax_quant.step(
        t_sample,
        x_quant,
        where="mid",
        linewidth=2,
        label="Valor cuantificado"
    )

    ax_quant.scatter(
        t_sample,
        x_quant,
        s=35,
        zorder=3
    )

    ax_quant.set_title(
        f"3. Cuantificación — {bits} bits = {2**bits} niveles posibles",
        loc="left",
        fontweight="bold"
    )
    ax_quant.set_ylabel("Voltaje (V)")
    ax_quant.set_xlim(0, DURACION)
    ax_quant.set_ylim(-VREF - 0.15, VREF + 0.15)
    ax_quant.grid(alpha=0.20)
    ax_quant.legend(loc="upper right", fontsize=8)

    # --------------------------------------------------------
    # 4. CODIFICACIÓN BINARIA
    # --------------------------------------------------------
    ax_binary.step(
        t_sample,
        idx,
        where="mid",
        linewidth=2
    )
    ax_binary.scatter(t_sample, idx, s=35)

    # Mostrar códigos encima de las muestras.
    # Si hay demasiadas, mostramos solo algunas para que se lea.
    salto = max(1, int(np.ceil(len(t_sample) / 20)))

    for n, (ts, code, value) in enumerate(zip(t_sample, binary, idx)):
        if n % salto == 0:
            ax_binary.annotate(
                code,
                (ts, value),
                textcoords="offset points",
                xytext=(0, 8),
                ha="center",
                fontsize=8,
                rotation=0
            )

    ax_binary.set_title(
        "4. Codificación — cada nivel se representa mediante un número binario",
        loc="left",
        fontweight="bold"
    )
    ax_binary.set_xlabel("Tiempo (s)")
    ax_binary.set_ylabel("Código decimal")
    ax_binary.set_xlim(0, DURACION)
    ax_binary.set_ylim(-0.5, (2**bits - 1) + 1.5)
    ax_binary.set_yticks(range(2**bits))
    ax_binary.grid(alpha=0.25)

    # --------------------------------------------------------
    # INFORMACIÓN DIDÁCTICA
    # --------------------------------------------------------
    nyquist = 2 * f_signal
    cumple = fs >= nyquist

    delta = (2 * VREF) / (2**bits - 1)

    estado_nyquist = (
        "✓ cumple Nyquist"
        if cumple
        else "✗ NO cumple Nyquist: puede aparecer aliasing"
    )

    info_text.set_text(
        f"Señal: {f_signal:.1f} Hz   |   "
        f"Muestreo: {fs:.1f} muestras/s   |   "
        f"Nyquist mínimo: {nyquist:.1f} muestras/s   |   "
        f"{estado_nyquist}   |   "
        f"Resolución: {bits} bits ({2**bits} niveles)   |   "
        f"Paso aprox.: {delta:.3f} V"
    )

    fig.canvas.draw_idle()


# ------------------------------------------------------------
# SLIDERS
# ------------------------------------------------------------
ax_signal = plt.axes([0.16, 0.16, 0.70, 0.025])
ax_fs = plt.axes([0.16, 0.115, 0.70, 0.025])
ax_bits = plt.axes([0.16, 0.070, 0.70, 0.025])

slider_signal = Slider(
    ax=ax_signal,
    label="Frecuencia señal (Hz)",
    valmin=1,
    valmax=10,
    valinit=F_SIGNAL_INICIAL,
    valstep=0.5
)

slider_fs = Slider(
    ax=ax_fs,
    label="Frecuencia muestreo (Hz)",
    valmin=2,
    valmax=50,
    valinit=FS_INICIAL,
    valstep=1
)

slider_bits = Slider(
    ax=ax_bits,
    label="Bits ADC",
    valmin=1,
    valmax=6,
    valinit=BITS_INICIAL,
    valstep=1
)

slider_signal.on_changed(lambda _: dibujar())
slider_fs.on_changed(lambda _: dibujar())
slider_bits.on_changed(lambda _: dibujar())

# ------------------------------------------------------------
# BOTÓN RESET
# ------------------------------------------------------------
ax_reset = plt.axes([0.88, 0.02, 0.08, 0.035])
btn_reset = Button(ax_reset, "Reset")


def reset(event):
    slider_signal.reset()
    slider_fs.reset()
    slider_bits.reset()


btn_reset.on_clicked(reset)

# Primer dibujo
dibujar()

plt.show()
