"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { AreaEmpresa } from "@/lib/areas";
import type { Cliente } from "@/lib/clientes";
import {
  CATEGORIAS_APLICACION,
  formatearPesos,
  type CategoriaAplicacion,
} from "@/lib/pedidos-comun";
import type { Producto } from "@/lib/productos";
import { IconClose, IconPlus } from "../icons";

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors duration-200 placeholder:text-slate-500 focus:border-blue-600 disabled:opacity-60 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-blue-400";
const etiqueta = "text-xs font-medium text-slate-700 dark:text-slate-300";

type Renglon = {
  /** Clave estable de la fila mientras se edita; no viaja al servidor. */
  clave: string;
  codigo: string;
  cantidad: string;
  precio: string;
};

function renglonVacio(indice: number): Renglon {
  return { clave: `r${indice}`, codigo: "", cantidad: "", precio: "" };
}

export function FormularioPedido({
  clientes,
  productos,
  areas,
  sesion,
  hoy,
  onCerrar,
}: {
  clientes: Cliente[];
  productos: Producto[];
  areas: AreaEmpresa[];
  sesion: { idEmpleado: string; nombre: string };
  hoy: string;
  onCerrar: () => void;
}) {
  const router = useRouter();

  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [categoria, setCategoria] = useState("");
  const [area, setArea] = useState("");
  const [notas, setNotas] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([renglonVacio(0)]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const siguienteClave = useRef(1);
  const dialogoRef = useRef<HTMLDivElement>(null);

  const porCodigo = useMemo(
    () => new Map(productos.map((p) => [p.codigo, p])),
    [productos],
  );

  const total = useMemo(
    () =>
      renglones.reduce((suma, renglon) => {
        const cantidad = Number(renglon.cantidad);
        const precio = Number(renglon.precio);
        if (!Number.isFinite(cantidad) || !Number.isFinite(precio)) return suma;
        return suma + cantidad * precio;
      }, 0),
    [renglones],
  );

  /* Atajos: Esc cierra, Ctrl+Enter guarda */
  useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        onCerrar();
      }
      if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
        evento.preventDefault();
        dialogoRef.current?.querySelector("form")?.requestSubmit();
      }
    }
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  function actualizarRenglon(clave: string, cambios: Partial<Renglon>) {
    setRenglones((previos) =>
      previos.map((renglon) =>
        renglon.clave === clave ? { ...renglon, ...cambios } : renglon,
      ),
    );
  }

  /** Al elegir producto se propone su precio de lista, editable. */
  function elegirProducto(clave: string, codigo: string) {
    const producto = porCodigo.get(codigo);
    const cambios: Partial<Renglon> = { codigo };
    if (producto?.precio !== null && producto?.precio !== undefined) {
      cambios.precio = String(producto.precio);
    }
    actualizarRenglon(clave, cambios);
  }

  function agregarRenglon() {
    setRenglones((previos) => [
      ...previos,
      renglonVacio(siguienteClave.current++),
    ]);
  }

  function quitarRenglon(clave: string) {
    setRenglones((previos) =>
      previos.length === 1
        ? previos
        : previos.filter((renglon) => renglon.clave !== clave),
    );
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();

    const cliente = clientes.find((c) => c.recordId === clienteId);
    if (!cliente) {
      setError("Elige un cliente de la lista.");
      return;
    }

    const lineas = renglones
      .filter((renglon) => renglon.codigo)
      .map((renglon) => ({
        idProductoCore: renglon.codigo,
        cantidad: Number(renglon.cantidad),
        precioUnitario: Number(renglon.precio || 0),
      }));

    if (lineas.length === 0) {
      setError("Agrega al menos un producto al pedido.");
      return;
    }
    if (lineas.some((linea) => !Number.isFinite(linea.cantidad) || linea.cantidad <= 0)) {
      setError("Cada renglón necesita una cantidad mayor que cero.");
      return;
    }

    setGuardando(true);
    setError(null);

    const respuesta = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idClienteCore: cliente.id,
        fecha,
        idAreaCore: area || undefined,
        categoriaAplicacion: categoria || undefined,
        notas: notas.trim() || undefined,
        lineas,
      }),
    });

    const data = (await respuesta.json().catch(() => ({}))) as {
      error?: string;
    };

    setGuardando(false);

    if (!respuesta.ok) {
      setError(data.error ?? "No pudimos guardar el pedido.");
      return;
    }

    router.refresh();
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-6">
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-pedido"
        className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div>
            <h2
              id="titulo-pedido"
              className="text-base font-semibold tracking-tight"
            >
              Registrar pedido
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Se guarda en Sirius Pedidos Core · el despacho lo registra
              logística
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="cursor-pointer rounded-lg p-2 text-slate-600 transition-colors duration-200 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none dark:text-slate-300 dark:hover:bg-white/10"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-5 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pedido-cliente" className={etiqueta}>
                Cliente *
              </label>
              <select
                id="pedido-cliente"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                disabled={guardando}
                className={`${input} cursor-pointer`}
              >
                <option value="">Selecciona…</option>
                {clientes.map((cliente) => (
                  <option key={cliente.recordId} value={cliente.recordId}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pedido-fecha" className={etiqueta}>
                Fecha del pedido *
              </label>
              <input
                id="pedido-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={guardando}
                className={input}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pedido-responsable" className={etiqueta}>
                Responsable comercial
              </label>
              {/* El pedido queda a nombre de quien lo registra, siempre: es la
                  clave de propiedad con la que se decide quién puede tocarlo,
                  así que no se elige. */}
              <p
                id="pedido-responsable"
                className={`${input} bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400`}
              >
                {sesion.nombre}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pedido-area" className={etiqueta}>
                Área de la empresa
              </label>
              <select
                id="pedido-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                disabled={guardando}
                className={`${input} cursor-pointer`}
              >
                <option value="">Sin definir</option>
                {areas.map((opcion) => (
                  <option key={opcion.codigo} value={opcion.codigo}>
                    {opcion.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label htmlFor="pedido-categoria" className={etiqueta}>
                Categoría de aplicación
              </label>
              <select
                id="pedido-categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                disabled={guardando}
                className={`${input} cursor-pointer`}
              >
                <option value="">Sin definir</option>
                {CATEGORIAS_APLICACION.map((valor: CategoriaAplicacion) => (
                  <option key={valor} value={valor}>
                    {valor}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* --------------------------- Renglones --------------------------- */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className={etiqueta}>Productos del pedido *</span>
              <button
                type="button"
                onClick={agregarRenglon}
                disabled={guardando}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-800 transition-colors duration-200 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-60 dark:text-blue-300 dark:hover:bg-blue-500/15"
              >
                <IconPlus className="h-3.5 w-3.5" />
                Agregar renglón
              </button>
            </div>

            <ul className="mt-2 flex flex-col gap-2">
              {renglones.map((renglon) => {
                const producto = porCodigo.get(renglon.codigo);
                return (
                  <li
                    key={renglon.clave}
                    className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end dark:border-white/10"
                  >
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`producto-${renglon.clave}`}
                        className="text-[11px] text-slate-600 dark:text-slate-400"
                      >
                        Producto
                      </label>
                      <select
                        id={`producto-${renglon.clave}`}
                        value={renglon.codigo}
                        onChange={(e) =>
                          elegirProducto(renglon.clave, e.target.value)
                        }
                        disabled={guardando}
                        className={`${input} cursor-pointer`}
                      >
                        <option value="">Selecciona…</option>
                        {productos.map((producto) => (
                          <option key={producto.codigo} value={producto.codigo}>
                            {producto.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`cantidad-${renglon.clave}`}
                        className="text-[11px] text-slate-600 dark:text-slate-400"
                      >
                        Cantidad {producto?.unidad ? `(${producto.unidad})` : ""}
                      </label>
                      <input
                        id={`cantidad-${renglon.clave}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={renglon.cantidad}
                        onChange={(e) =>
                          actualizarRenglon(renglon.clave, {
                            cantidad: e.target.value,
                          })
                        }
                        disabled={guardando}
                        className={input}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`precio-${renglon.clave}`}
                        className="text-[11px] text-slate-600 dark:text-slate-400"
                      >
                        Precio unitario
                      </label>
                      <input
                        id={`precio-${renglon.clave}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={renglon.precio}
                        onChange={(e) =>
                          actualizarRenglon(renglon.clave, {
                            precio: e.target.value,
                          })
                        }
                        disabled={guardando}
                        className={input}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => quitarRenglon(renglon.clave)}
                      disabled={guardando || renglones.length === 1}
                      aria-label="Quitar renglón"
                      className="cursor-pointer rounded-lg p-2 text-slate-600 transition-colors duration-200 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10"
                    >
                      <IconClose className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-2 text-right text-sm">
              <span className="text-slate-600 dark:text-slate-400">Total: </span>
              <span className="font-semibold tabular-nums">
                {formatearPesos(total)}
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pedido-notas" className={etiqueta}>
              Notas
            </label>
            <textarea
              id="pedido-notas"
              rows={3}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={guardando}
              placeholder="Condiciones de entrega, acuerdos de despacho, referencias…"
              className={input}
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Ctrl + Enter guarda · Esc cierra
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCerrar}
                disabled={guardando}
                className="cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="cursor-pointer rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                {guardando ? "Guardando…" : "Guardar pedido"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
