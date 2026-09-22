import { NextResponse } from "next/server";

import { listarPersonalActivo } from "@/lib/airtable";
import { esAreaDePedido, listarAreas, SERIAL_AREA } from "@/lib/areas";
import { esErrorAutoria, resolverAutoria } from "@/lib/autoria";
import { ETIQUETAS, invalidar } from "@/lib/cache";
import {
  CATEGORIAS_APLICACION,
  conAreas,
  conResponsables,
  crearPedido,
  ESTADOS_PEDIDO,
  estaCerradoPedido,
  leerCantidad,
  listarPedidos,
  type CategoriaAplicacion,
  type EstadoPedido,
  type LineaNueva,
} from "@/lib/pedidos";
import { filtrarPorAlcance, permisosDe } from "@/lib/permisos";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const SERIAL_CLIENTE = /^CL-\d{3,6}$/;
const SERIAL_PRODUCTO = /^SIRIUS-PRODUCT-\d{3,6}$/;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const permisos = permisosDe(session);

  try {
    // La tabla de pedidos solo guarda los seriales del responsable y del área;
    // quien consume la API —el conector MCP— necesita los nombres, igual que
    // la pantalla. Ambos maestros van cacheados, así que no cuestan una vuelta.
    const [pedidos, personal, areas] = await Promise.all([
      listarPedidos(),
      listarPersonalActivo(),
      listarAreas(),
    ]);

    const conNombre = conAreas(conResponsables(pedidos, personal), areas);
    return NextResponse.json({
      pedidos: filtrarPorAlcance(conNombre, permisos, session),
    });
  } catch (error) {
    console.error("listar pedidos", error);
    return NextResponse.json(
      { error: "No pudimos leer los pedidos." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const permisos = permisosDe(session);
  if (!permisos.crear) {
    return NextResponse.json(
      { error: "Tu nivel de acceso no permite registrar pedidos." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!body) {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const idClienteCore = cadena(body.idClienteCore);
  const fecha = cadena(body.fecha);
  // El estado inicial no se elige en el formulario: un pedido que entra al CRM
  // está Recibido, y de ahí lo mueve quien lo atiende. El conector MCP sí lo
  // manda explícito, así que lo que llegue se sigue validando.
  const estado = cadena(body.estado) ?? "Recibido";
  const categoria = cadena(body.categoriaAplicacion);
  const idAreaCore = cadena(body.idAreaCore);

  if (!idClienteCore || !SERIAL_CLIENTE.test(idClienteCore)) {
    return NextResponse.json(
      { error: "Elige un cliente del catálogo." },
      { status: 400 },
    );
  }
  if (!fecha || !FECHA.test(fecha)) {
    return NextResponse.json(
      { error: "La fecha del pedido es obligatoria." },
      { status: 400 },
    );
  }
  if (!ESTADOS_PEDIDO.includes(estado as EstadoPedido)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }
  // Un pedido nuevo se registra para atenderlo; nacer cerrado no tiene sentido.
  if (estaCerradoPedido(estado)) {
    return NextResponse.json(
      { error: "Un pedido nuevo no puede nacer Completado ni Cancelado." },
      { status: 400 },
    );
  }
  if (
    categoria &&
    !CATEGORIAS_APLICACION.includes(categoria as CategoriaAplicacion)
  ) {
    return NextResponse.json(
      { error: "Categoría de aplicación inválida." },
      { status: 400 },
    );
  }

  // El área es opcional, pero si viene tiene que ser un serial de Nómina —un
  // texto libre rompería el cruce para quien lea la base después— y una de las
  // dos líneas productivas, que son las únicas que atienden un pedido.
  if (
    idAreaCore &&
    (!SERIAL_AREA.test(idAreaCore) || !esAreaDePedido(idAreaCore))
  ) {
    return NextResponse.json(
      { error: "Elige un área de la lista." },
      { status: 400 },
    );
  }

  const lineas = leerLineas(body.lineas);
  if (typeof lineas === "string") {
    return NextResponse.json({ error: lineas }, { status: 400 });
  }

  // El pedido se registra a nombre de alguien igual que una visita o un caso.
  const autoria = await resolverAutoria(session, permisos, {
    id: cadena(body.responsableId),
    nombre: cadena(body.responsable),
  });
  if (esErrorAutoria(autoria)) {
    return NextResponse.json(
      { error: autoria.error },
      { status: autoria.status },
    );
  }

  try {
    const pedido = await crearPedido({
      idClienteCore,
      idPersonalCore: autoria.idPersonalCore,
      idAreaCore: idAreaCore ?? undefined,
      fecha,
      estado: estado as EstadoPedido,
      categoriaAplicacion: (categoria as CategoriaAplicacion) ?? undefined,
      notas: cadena(body.notas) ?? undefined,
      lineas,
    });

    invalidar(ETIQUETAS.pedidos);
    return NextResponse.json({ pedido }, { status: 201 });
  } catch (error) {
    console.error("crear pedido", error);
    // Si el pedido se creó y falló un renglón, el mensaje lo dice con su serial.
    const mensaje =
      error instanceof Error && error.message.includes("SIRIUS-PED-")
        ? error.message
        : "No pudimos guardar el pedido en Airtable.";
    invalidar(ETIQUETAS.pedidos);
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }
}

/** Valida los renglones del pedido; devuelve el mensaje de error si algo falla. */
function leerLineas(valor: unknown): LineaNueva[] | string {
  if (!Array.isArray(valor) || valor.length === 0) {
    return "Agrega al menos un producto al pedido.";
  }
  if (valor.length > 50) {
    return "Un pedido no puede tener más de 50 renglones.";
  }

  const lineas: LineaNueva[] = [];
  const vistos = new Set<string>();

  for (const crudo of valor) {
    if (typeof crudo !== "object" || crudo === null) {
      return "Renglón inválido.";
    }
    const item = crudo as Record<string, unknown>;

    const idProductoCore = cadena(item.idProductoCore);
    if (!idProductoCore || !SERIAL_PRODUCTO.test(idProductoCore)) {
      return "Cada renglón debe apuntar a un producto del catálogo.";
    }
    if (vistos.has(idProductoCore)) {
      return "Hay un producto repetido: súmalo en un solo renglón.";
    }
    vistos.add(idProductoCore);

    const cantidad = leerCantidad(item.cantidad);
    if (cantidad === "invalido") {
      return "La cantidad de cada renglón debe ser mayor que cero.";
    }

    // El precio sí admite cero: las muestras comerciales van sin costo.
    const precio =
      typeof item.precioUnitario === "number"
        ? item.precioUnitario
        : Number(String(item.precioUnitario ?? ""));
    if (!Number.isFinite(precio) || precio < 0) {
      return "El precio de cada renglón debe ser un número igual o mayor que cero.";
    }

    lineas.push({ idProductoCore, cantidad, precioUnitario: precio });
  }

  return lineas;
}

function cadena(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}
