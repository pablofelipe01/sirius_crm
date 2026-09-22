import {
  actualizarRegistro,
  crearRegistro,
  listarRegistros,
  texto,
  type AirtableRecord,
} from "@/lib/airtable";
import { cachearLectura, ETIQUETAS } from "@/lib/cache";
import { env } from "@/lib/env";
import type { CategoriaAplicacion, EstadoPedido } from "@/lib/pedidos-comun";

/**
 * Base "Sirius Pedidos Core": los pedidos y sus líneas de producto.
 *
 * La base la comparten DataLab y PiroliApp, así que el CRM solo lee y escribe
 * los campos que ya existen. El cruce con el resto del sistema es por serial:
 * `ID Cliente Core` (CL-XXXX), `ID Producto Core` (SIRIUS-PRODUCT-XXXX),
 * `ID Area Core` (SIRIUS-AREA-XXXX) e `ID Usuario Responsable`
 * (SIRIUS-PER-XXXX), que además es la clave de propiedad del registro para los
 * permisos.
 */

const CAMPOS_PEDIDO = {
  id: "ID Pedido Core",
  idClienteCore: "ID Cliente Core",
  idPersonalCore: "ID Usuario Responsable",
  idAreaCore: "ID Area Core",
  fecha: "Fecha de Pedido",
  origen: "Origen del Pedido",
  estado: "Estado",
  categoriaAplicacion: "Categoria Aplicación",
  notas: "Notas",
  detalles: "Detalles del Pedido",
} as const;

const CAMPOS_DETALLE = {
  id: "ID",
  pedido: "Pedido",
  idProductoCore: "ID Producto Core",
  cantidad: "Cantidad Pedido",
  precio: "Precio unitario en el momento del pedido",
} as const;

export {
  CATEGORIAS_APLICACION,
  ESTADOS_PEDIDO,
  estaCerradoPedido,
  formatearCantidad,
  formatearPesos,
  leerCantidad,
  siguientesEstados,
} from "@/lib/pedidos-comun";
export type { CategoriaAplicacion, EstadoPedido } from "@/lib/pedidos-comun";

export type LineaPedido = {
  recordId: string;
  id: string;
  idProductoCore: string | null;
  cantidad: number;
  /** Precio congelado al momento del pedido, no el de lista de hoy. */
  precioUnitario: number | null;
  subtotal: number;
};

export type Pedido = {
  recordId: string;
  /** Serial legible, formato SIRIUS-PED-XXXX. Es lo que referencia la remisión. */
  id: string;
  idClienteCore: string | null;
  /** ID Empleado del responsable: la clave de propiedad para los permisos. */
  idPersonalCore: string | null;
  /** Se resuelve contra Sirius Nomina Core; la tabla solo guarda el ID. */
  responsable: string | null;
  /** Código SIRIUS-AREA-XXXX del área de la empresa dueña del pedido. */
  idAreaCore: string | null;
  /** Igual que `responsable`: el nombre se resuelve, el código es el dato. */
  area: string | null;
  /** YYYY-MM-DD. El campo en Airtable es dateTime; aquí solo interesa el día. */
  fecha: string | null;
  origen: string | null;
  estado: string | null;
  categoriaAplicacion: string | null;
  notas: string | null;
  lineas: LineaPedido[];
  total: number;
};

function numero(valor: unknown): number | null {
  return typeof valor === "number" ? valor : null;
}

/** Los campos de vínculo llegan como arreglo de record ids. */
function vinculos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === "string")
    : [];
}

/** El campo es dateTime; el día en Bogotá es lo que se muestra y se filtra. */
function soloDia(valor: unknown): string | null {
  const crudo = texto(valor);
  if (!crudo) return null;

  const fecha = new Date(crudo);
  if (Number.isNaN(fecha.getTime())) return crudo.slice(0, 10) || null;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

function aLinea(registro: AirtableRecord): LineaPedido {
  const f = registro.fields;
  const cantidad = numero(f[CAMPOS_DETALLE.cantidad]) ?? 0;
  const precioUnitario = numero(f[CAMPOS_DETALLE.precio]);

  return {
    recordId: registro.id,
    id: texto(f[CAMPOS_DETALLE.id]) ?? registro.id,
    idProductoCore: texto(f[CAMPOS_DETALLE.idProductoCore]),
    cantidad,
    precioUnitario,
    subtotal: cantidad * (precioUnitario ?? 0),
  };
}

/**
 * Lee pedidos y líneas de una sola vez y las cruza en memoria.
 *
 * Se agrupa por el vínculo que guarda el detalle hacia su pedido, no por el
 * del pedido hacia sus detalles: si un renglón queda huérfano de un lado, este
 * sentido es el que refleja la verdad de la línea.
 */
const leerPedidos = cachearLectura(
  // "pedidos-v2": Pedido ganó idAreaCore y area. Las entradas viejas no se
  // invalidan al desplegar, y con la clave anterior el área saldría vacía.
  "pedidos-v2",
  ETIQUETAS.pedidos,
  async (): Promise<Pedido[]> => {
    const [registros, detalles] = await Promise.all([
      listarRegistros(env.basePedidos, env.tablaPedidos, {
        fields: Object.values(CAMPOS_PEDIDO),
      }),
      listarRegistros(env.basePedidos, env.tablaDetallesPedido, {
        fields: Object.values(CAMPOS_DETALLE),
      }),
    ]);

    const porPedido = new Map<string, LineaPedido[]>();
    for (const registro of detalles) {
      for (const recordId of vinculos(registro.fields[CAMPOS_DETALLE.pedido])) {
        const lista = porPedido.get(recordId);
        if (lista) lista.push(aLinea(registro));
        else porPedido.set(recordId, [aLinea(registro)]);
      }
    }

    return registros
      .map((registro) => {
        const f = registro.fields;
        const lineas = (porPedido.get(registro.id) ?? []).sort((a, b) =>
          a.id.localeCompare(b.id, "es", { numeric: true }),
        );

        return {
          recordId: registro.id,
          id: texto(f[CAMPOS_PEDIDO.id]) ?? registro.id,
          idClienteCore: texto(f[CAMPOS_PEDIDO.idClienteCore]),
          idPersonalCore: texto(f[CAMPOS_PEDIDO.idPersonalCore]),
          responsable: null,
          idAreaCore: texto(f[CAMPOS_PEDIDO.idAreaCore]),
          area: null,
          fecha: soloDia(f[CAMPOS_PEDIDO.fecha]),
          origen: texto(f[CAMPOS_PEDIDO.origen]),
          estado: texto(f[CAMPOS_PEDIDO.estado]),
          categoriaAplicacion: texto(f[CAMPOS_PEDIDO.categoriaAplicacion]),
          notas: texto(f[CAMPOS_PEDIDO.notas]),
          lineas,
          total: lineas.reduce((suma, linea) => suma + linea.subtotal, 0),
        };
      })
      .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  },
);

export async function listarPedidos(): Promise<Pedido[]> {
  return leerPedidos();
}

/**
 * Un pedido leído sin caché. Se usa antes de escribir: decidir un permiso
 * sobre un dato viejo dejaría editar algo que ya cambió de dueño.
 */
export async function obtenerPedido(recordId: string): Promise<Pedido | null> {
  const pedidos = await leerPedidosFrescos(recordId);
  return pedidos[0] ?? null;
}

async function leerPedidosFrescos(recordId: string): Promise<Pedido[]> {
  const registros = await listarRegistros(env.basePedidos, env.tablaPedidos, {
    fields: Object.values(CAMPOS_PEDIDO),
    filterByFormula: `RECORD_ID() = '${recordId}'`,
    maxRecords: 1,
  });

  return registros.map((registro) => {
    const f = registro.fields;
    return {
      recordId: registro.id,
      id: texto(f[CAMPOS_PEDIDO.id]) ?? registro.id,
      idClienteCore: texto(f[CAMPOS_PEDIDO.idClienteCore]),
      idPersonalCore: texto(f[CAMPOS_PEDIDO.idPersonalCore]),
      responsable: null,
      idAreaCore: texto(f[CAMPOS_PEDIDO.idAreaCore]),
      area: null,
      fecha: soloDia(f[CAMPOS_PEDIDO.fecha]),
      origen: texto(f[CAMPOS_PEDIDO.origen]),
      estado: texto(f[CAMPOS_PEDIDO.estado]),
      categoriaAplicacion: texto(f[CAMPOS_PEDIDO.categoriaAplicacion]),
      notas: texto(f[CAMPOS_PEDIDO.notas]),
      lineas: [],
      total: 0,
    };
  });
}

/** Pone el nombre del responsable a partir del ID; el ID sigue mandando. */
export function conResponsables(
  pedidos: Pedido[],
  personal: { nombre: string; idEmpleado: string }[],
): Pedido[] {
  const porId = new Map(personal.map((p) => [p.idEmpleado, p.nombre]));
  return pedidos.map((pedido) => ({
    ...pedido,
    responsable: pedido.idPersonalCore
      ? (porId.get(pedido.idPersonalCore) ?? null)
      : null,
  }));
}

/** Pone el nombre del área a partir del código; el código sigue mandando. */
export function conAreas(
  pedidos: Pedido[],
  areas: { codigo: string; nombre: string }[],
): Pedido[] {
  const porCodigo = new Map(areas.map((a) => [a.codigo, a.nombre]));
  return pedidos.map((pedido) => ({
    ...pedido,
    area: pedido.idAreaCore ? (porCodigo.get(pedido.idAreaCore) ?? null) : null,
  }));
}

/* -------------------------------- Escritura ------------------------------ */

export type LineaNueva = {
  idProductoCore: string;
  cantidad: number;
  precioUnitario: number;
};

export type EntradaPedido = {
  idClienteCore: string;
  idPersonalCore: string;
  /** Código SIRIUS-AREA-XXXX; opcional porque los pedidos viejos no lo tienen. */
  idAreaCore?: string;
  /** YYYY-MM-DD; se guarda al mediodía de Bogotá para no cruzar de día. */
  fecha: string;
  estado: EstadoPedido;
  categoriaAplicacion?: CategoriaAplicacion;
  notas?: string;
  lineas: LineaNueva[];
};

/**
 * Crea el pedido y sus renglones.
 *
 * El pedido va primero porque cada detalle necesita su record id. Si un
 * renglón falla, el pedido ya existe: se devuelve el error con el serial para
 * poder completarlo a mano en vez de dejar un registro invisible.
 */
export async function crearPedido(entrada: EntradaPedido): Promise<Pedido> {
  const fields: Record<string, unknown> = {
    [CAMPOS_PEDIDO.idClienteCore]: entrada.idClienteCore,
    [CAMPOS_PEDIDO.idPersonalCore]: entrada.idPersonalCore,
    // Mediodía: guardar a las 00:00 UTC restaría un día al pasar a Bogotá.
    [CAMPOS_PEDIDO.fecha]: `${entrada.fecha}T12:00:00.000Z`,
    [CAMPOS_PEDIDO.estado]: entrada.estado,
    [CAMPOS_PEDIDO.notas]: entrada.notas ?? "",
  };

  if (entrada.idAreaCore) {
    fields[CAMPOS_PEDIDO.idAreaCore] = entrada.idAreaCore;
  }

  if (entrada.categoriaAplicacion) {
    fields[CAMPOS_PEDIDO.categoriaAplicacion] = entrada.categoriaAplicacion;
  }

  const registro = await crearRegistro(
    env.basePedidos,
    env.tablaPedidos,
    fields,
  );
  const serial = texto(registro.fields[CAMPOS_PEDIDO.id]) ?? registro.id;

  for (const linea of entrada.lineas) {
    try {
      await crearRegistro(env.basePedidos, env.tablaDetallesPedido, {
        [CAMPOS_DETALLE.pedido]: [registro.id],
        [CAMPOS_DETALLE.idProductoCore]: linea.idProductoCore,
        [CAMPOS_DETALLE.cantidad]: linea.cantidad,
        [CAMPOS_DETALLE.precio]: linea.precioUnitario,
      });
    } catch (error) {
      console.error("crear detalle de pedido", error);
      throw new Error(
        `El pedido ${serial} quedó creado, pero un renglón no se pudo guardar. Revísalo en Airtable antes de reintentar.`,
      );
    }
  }

  const completo = await obtenerPedido(registro.id);
  return completo ?? { ...vacio(registro.id, serial), lineas: [], total: 0 };
}

export async function cambiarEstadoPedido(
  recordId: string,
  estado: EstadoPedido,
): Promise<Pedido> {
  const registro = await actualizarRegistro(
    env.basePedidos,
    env.tablaPedidos,
    recordId,
    { [CAMPOS_PEDIDO.estado]: estado },
  );

  const actualizado = await obtenerPedido(registro.id);
  return actualizado ?? vacio(registro.id, texto(registro.fields[CAMPOS_PEDIDO.id]) ?? registro.id);
}

function vacio(recordId: string, id: string): Pedido {
  return {
    recordId,
    id,
    idClienteCore: null,
    idPersonalCore: null,
    responsable: null,
    idAreaCore: null,
    area: null,
    fecha: null,
    origen: null,
    estado: null,
    categoriaAplicacion: null,
    notas: null,
    lineas: [],
    total: 0,
  };
}
