/**
 * Las herramientas de consulta. Ninguna escribe nada, así que todas se
 * anuncian con `readOnlyHint` y el cliente MCP puede correrlas sin preguntar.
 */

import { z } from "zod";

import {
  contiene,
  enRango,
  hoy,
  limpiar,
  resolverCliente,
  respuesta,
} from "./comun.mjs";
import { ESTADOS_COTIZACION_CERRADOS } from "./opciones.mjs";

const SOLO_LECTURA = { readOnlyHint: true, openWorldHint: false };

/** Lo que de una visita interesa en una lista. */
export function resumirVisita(visita) {
  return limpiar({
    id: visita.id,
    recordId: visita.recordId,
    fecha: visita.fecha,
    cliente: visita.cliente,
    idClienteCore: visita.idClienteCore,
    responsable: visita.responsable,
    tipo: visita.tipo,
    objetivo: visita.objetivo,
    resultado: visita.resultado,
    proximaAccion: visita.proximaAccion,
    fechaSeguimiento: visita.fechaSeguimiento,
    estadoSeguimiento: visita.estadoSeguimiento,
    productos: visita.productos,
    necesidad: visita.necesidad,
    pendientes: visita.pendientes,
    observaciones: visita.observaciones,
  });
}

export function resumirCaso(caso) {
  return limpiar({
    id: caso.id,
    recordId: caso.recordId,
    cliente: caso.cliente,
    idClienteCore: caso.idClienteCore,
    tipo: caso.tipo,
    tipoOtroDetalle: caso.tipoOtroDetalle,
    estado: caso.estado,
    alerta: caso.alerta,
    fechaApertura: caso.fechaApertura,
    fechaLimite: caso.fechaLimite,
    fechaCierre: caso.fechaCierre,
    diasAbierto: caso.diasAbierto,
    responsable: caso.responsable,
    descripcion: caso.descripcion,
    seguimiento: caso.seguimiento,
    solucionFinal: caso.solucionFinal,
    observaciones: caso.observaciones,
  });
}

export function resumirPedido(pedido) {
  return limpiar({
    id: pedido.id,
    recordId: pedido.recordId,
    fecha: pedido.fecha,
    idClienteCore: pedido.idClienteCore,
    estado: pedido.estado,
    responsable: pedido.responsable,
    area: pedido.area,
    categoriaAplicacion: pedido.categoriaAplicacion,
    origen: pedido.origen,
    total: pedido.total,
    notas: pedido.notas,
    lineas: (pedido.lineas ?? []).map((linea) =>
      limpiar({
        producto: linea.idProductoCore,
        cantidad: linea.cantidad,
        precioUnitario: linea.precioUnitario,
        subtotal: linea.subtotal,
      }),
    ),
  });
}

export function resumirCotizacion(cotizacion) {
  return limpiar({
    id: cotizacion.id,
    recordId: cotizacion.recordId,
    revision: cotizacion.revision,
    titulo: cotizacion.titulo,
    cliente: cotizacion.cliente,
    idClienteCore: cotizacion.idClienteCore,
    contacto: cotizacion.contacto,
    estado: cotizacion.estado,
    responsable: cotizacion.responsable,
    fechaEmision: cotizacion.fechaEmision,
    vigenciaDias: cotizacion.vigenciaDias,
    fechaEnvio: cotizacion.fechaEnvio,
    fechaCierre: cotizacion.fechaCierre,
    motivoCierre: cotizacion.motivoCierre,
    subtotal: cotizacion.subtotal,
    // Null cuando el IVA esta por confirmar, que no es lo mismo que 0 %.
    ivaPorcentaje: cotizacion.ivaPorcentaje,
    iva: cotizacion.iva,
    total: cotizacion.total,
    modalidadEntrega: cotizacion.modalidadEntrega,
    puntoEntrega: cotizacion.puntoEntrega,
    formaPago: cotizacion.formaPago,
    observaciones: cotizacion.observaciones,
    lineas: (cotizacion.lineas ?? []).map((linea) =>
      limpiar({
        producto: linea.producto ?? linea.idProductoCore,
        codigo: linea.idProductoCore,
        cantidad: linea.cantidad,
        unidad: linea.unidad,
        precioUnitario: linea.precioUnitario,
        subtotal: linea.subtotal,
      }),
    ),
  });
}

/** True si el registro pertenece al cliente, por serial o por nombre. */
export function esDelCliente(registro, cliente) {
  return (
    (Boolean(cliente.id) && registro.idClienteCore === cliente.id) ||
    registro.cliente === cliente.nombre
  );
}

export function registrarLectura(servidor, api) {
  const obtener = api.obtener;

  servidor.registerTool(
    "crm_quien_soy",
    {
      title: "Quién soy en el CRM",
      description:
        "La sesión con la que el conector entra al CRM y qué permite su nivel de acceso. " +
        "Conviene llamarla primero: el nivel decide si se ven los registros de todo el " +
        "equipo o solo los propios, y si se puede escribir.",
      inputSchema: {},
      annotations: SOLO_LECTURA,
    },
    async () => respuesta(await obtener("/api/sesion")),
  );

  servidor.registerTool(
    "crm_resumen",
    {
      title: "Resumen del CRM",
      description:
        "KPIs, compromisos pendientes, seguimientos, actividad reciente, clientes más " +
        "activos y desempeño del equipo: lo mismo que muestra el home del dashboard, " +
        "recortado al alcance de la sesión. El punto de partida para cualquier pregunta " +
        "de cómo va el mes.",
      inputSchema: {},
      annotations: SOLO_LECTURA,
    },
    async () => respuesta(await obtener("/api/resumen")),
  );

  servidor.registerTool(
    "crm_buscar_clientes",
    {
      title: "Buscar clientes",
      description:
        "El maestro de clientes, filtrable por texto libre (nombre, NIT, ciudad, sector, " +
        "segmento o etapa). Devuelve el serial CL-000X, que es lo que referencian visitas, " +
        "casos y pedidos.",
      inputSchema: {
        texto: z
          .string()
          .optional()
          .describe("Filtro libre. Sin él devuelve todo el maestro."),
        soloActivos: z
          .boolean()
          .optional()
          .describe("Por defecto true: los inactivos rara vez interesan."),
        limite: z.number().int().min(1).max(200).optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ texto, soloActivos = true, limite = 50 }) => {
      const { clientes } = await obtener("/api/clientes");

      const filtrados = clientes.filter((cliente) => {
        if (soloActivos && !cliente.activo) return false;
        if (!texto) return true;
        return [
          cliente.nombre,
          cliente.nit,
          cliente.ciudad,
          cliente.departamento,
          cliente.sector,
          cliente.segmento,
          cliente.etapa,
        ].some((campo) => campo && contiene(campo, texto));
      });

      return respuesta({
        total: filtrados.length,
        mostrados: Math.min(filtrados.length, limite),
        clientes: filtrados.slice(0, limite).map((cliente) =>
          limpiar({
            id: cliente.id,
            recordId: cliente.recordId,
            nombre: cliente.nombre,
            nit: cliente.nit,
            ciudad: cliente.ciudad,
            departamento: cliente.departamento,
            sector: cliente.sector,
            segmento: cliente.segmento,
            etapa: cliente.etapa,
            responsableComercial: cliente.responsableComercial,
            activo: cliente.activo,
            vinculacion: cliente.vinculacion,
            comoConocio: cliente.comoConocio,
          }),
        ),
      });
    },
  );

  servidor.registerTool(
    "crm_detalle_cliente",
    {
      title: "Ficha completa de un cliente",
      description:
        "Todo lo que el CRM sabe de un cliente en una sola llamada: ficha, contactos, " +
        "visitas, casos y pedidos. Úsala antes de preparar una visita o de responder una " +
        "queja.",
      inputSchema: {
        cliente: z
          .string()
          .describe("Serial CL-000X, record id o nombre del cliente."),
        limiteHistorial: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(
            "Cuántas visitas, casos y pedidos traer. Por defecto 10 de cada uno.",
          ),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ cliente: referencia, limiteHistorial = 10 }) => {
      const cliente = await resolverCliente(api, referencia);

      // Los contactos exigen alcance de equipo; sin él la ficha sale igual,
      // solo sin esa sección, en vez de fallar entera por una parte.
      const [contactos, visitas, casos, pedidos] = await Promise.all([
        obtener("/api/contactos")
          .then((r) => r.contactos ?? [])
          .catch(() => null),
        obtener("/api/visitas").then((r) => r.visitas ?? []),
        obtener("/api/casos").then((r) => r.casos ?? []),
        obtener("/api/pedidos").then((r) => r.pedidos ?? []),
      ]);

      const suyas = visitas.filter((visita) => esDelCliente(visita, cliente));
      const susCasos = casos.filter((caso) => esDelCliente(caso, cliente));
      const susPedidos = pedidos.filter(
        (pedido) => cliente.id && pedido.idClienteCore === cliente.id,
      );

      return respuesta({
        cliente: limpiar(cliente),
        contactos:
          contactos === null
            ? "Tu nivel de acceso no permite consultar los contactos."
            : contactos
                .filter((contacto) =>
                  contacto.clientes?.includes(cliente.recordId),
                )
                .map((contacto) =>
                  limpiar({
                    codigo: contacto.codigo,
                    nombre: contacto.nombre,
                    cargo: contacto.cargo,
                    funciones: contacto.funciones,
                    email: contacto.email,
                    telefono: contacto.telefono,
                    activo: contacto.activo,
                  }),
                ),
        visitas: {
          total: suyas.length,
          ultima: suyas[0]?.fecha ?? null,
          registros: suyas.slice(0, limiteHistorial).map(resumirVisita),
        },
        casos: {
          total: susCasos.length,
          pendientes: susCasos.filter(
            (caso) => caso.estado !== "Resuelto" && caso.estado !== "Cerrado",
          ).length,
          registros: susCasos.slice(0, limiteHistorial).map(resumirCaso),
        },
        pedidos: {
          total: susPedidos.length,
          valorTotal: susPedidos.reduce(
            (suma, pedido) => suma + (pedido.total ?? 0),
            0,
          ),
          registros: susPedidos.slice(0, limiteHistorial).map(resumirPedido),
        },
      });
    },
  );

  servidor.registerTool(
    "crm_listar_contactos",
    {
      title: "Contactos de cliente",
      description:
        "Las personas registradas dentro de los clientes, con cargo, funciones y datos de " +
        "contacto. El código que devuelve es lo que se anota al registrar una visita o " +
        "abrir un caso.",
      inputSchema: {
        cliente: z
          .string()
          .optional()
          .describe("Limita a un cliente. Sin él devuelve todos."),
        texto: z.string().optional().describe("Filtro por nombre o cargo."),
        soloActivos: z.boolean().optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ cliente: referencia, texto, soloActivos = true }) => {
      const { contactos } = await obtener("/api/contactos");
      const cliente = referencia ? await resolverCliente(api, referencia) : null;

      const filtrados = contactos.filter((contacto) => {
        if (soloActivos && !contacto.activo) return false;
        if (cliente && !contacto.clientes?.includes(cliente.recordId)) {
          return false;
        }
        if (!texto) return true;
        return (
          contiene(contacto.nombre, texto) || contiene(contacto.cargo, texto)
        );
      });

      return respuesta({
        total: filtrados.length,
        contactos: filtrados.map((contacto) =>
          limpiar({
            codigo: contacto.codigo,
            recordId: contacto.recordId,
            nombre: contacto.nombre,
            cargo: contacto.cargo,
            funciones: contacto.funciones,
            cedula: contacto.cedula,
            email: contacto.email,
            emailNotificacion: contacto.emailNotificacion,
            telefono: contacto.telefono,
            activo: contacto.activo,
            clientes: contacto.clientes,
          }),
        ),
      });
    },
  );

  servidor.registerTool(
    "crm_listar_visitas",
    {
      title: "Visitas comerciales",
      description:
        "Las visitas registradas, de la más reciente a la más antigua. Filtra por cliente, " +
        "rango de fechas, responsable, resultado o si tienen seguimiento sin cerrar.",
      inputSchema: {
        cliente: z.string().optional(),
        desde: z.string().optional().describe("YYYY-MM-DD, inclusive."),
        hasta: z.string().optional().describe("YYYY-MM-DD, inclusive."),
        responsable: z
          .string()
          .optional()
          .describe("Nombre, o parte del nombre, de quien la hizo."),
        resultado: z
          .enum([
            "Interesado",
            "Cotización enviada",
            "Venta cerrada",
            "Seguimiento pendiente",
            "Sin interés por ahora",
          ])
          .optional(),
        seguimientoPendiente: z
          .boolean()
          .optional()
          .describe(
            "Solo las que tienen un compromiso de seguimiento abierto.",
          ),
        limite: z.number().int().min(1).max(200).optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async ({
      cliente: referencia,
      desde,
      hasta,
      responsable,
      resultado,
      seguimientoPendiente,
      limite = 30,
    }) => {
      const { visitas } = await obtener("/api/visitas");
      const cliente = referencia ? await resolverCliente(api, referencia) : null;

      const filtradas = visitas.filter((visita) => {
        if (cliente && !esDelCliente(visita, cliente)) return false;
        if (!enRango(visita.fecha, desde, hasta)) return false;
        if (responsable && !contiene(visita.responsable, responsable)) {
          return false;
        }
        if (resultado && visita.resultado !== resultado) return false;
        if (seguimientoPendiente && !visita.estadoSeguimiento) return false;
        return true;
      });

      return respuesta({
        total: filtradas.length,
        mostradas: Math.min(filtradas.length, limite),
        visitas: filtradas.slice(0, limite).map(resumirVisita),
      });
    },
  );

  servidor.registerTool(
    "crm_listar_casos",
    {
      title: "Casos PQRSF",
      description:
        "Los casos de atención al cliente. El campo alerta ya viene calculado con la fecha " +
        "de Bogotá: vencido es un caso fuera de plazo, hoy vence hoy.",
      inputSchema: {
        cliente: z.string().optional(),
        estado: z
          .enum(["Abierto", "En proceso", "Resuelto", "Cerrado"])
          .optional(),
        tipo: z
          .string()
          .optional()
          .describe(
            "Petición, Queja, Reclamo, Sugerencia, Felicitación, Otro, o la clasificación anterior.",
          ),
        soloPendientes: z
          .boolean()
          .optional()
          .describe(
            "Solo los que siguen exigiendo acción: ni resueltos ni cerrados.",
          ),
        soloVencidos: z
          .boolean()
          .optional()
          .describe("Solo los que ya pasaron su fecha límite."),
        desde: z.string().optional().describe("Apertura desde, YYYY-MM-DD."),
        hasta: z.string().optional().describe("Apertura hasta, YYYY-MM-DD."),
        limite: z.number().int().min(1).max(200).optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async ({
      cliente: referencia,
      estado,
      tipo,
      soloPendientes,
      soloVencidos,
      desde,
      hasta,
      limite = 30,
    }) => {
      const { casos } = await obtener("/api/casos");
      const cliente = referencia ? await resolverCliente(api, referencia) : null;

      const filtrados = casos.filter((caso) => {
        if (cliente && !esDelCliente(caso, cliente)) return false;
        if (estado && caso.estado !== estado) return false;
        if (tipo && !contiene(caso.tipo, tipo)) return false;
        if (
          soloPendientes &&
          (caso.estado === "Resuelto" || caso.estado === "Cerrado")
        ) {
          return false;
        }
        if (soloVencidos && caso.alerta !== "vencido") return false;
        if (!enRango(caso.fechaApertura, desde, hasta)) return false;
        return true;
      });

      return respuesta({
        hoy: hoy(),
        total: filtrados.length,
        mostrados: Math.min(filtrados.length, limite),
        casos: filtrados.slice(0, limite).map(resumirCaso),
      });
    },
  );

  servidor.registerTool(
    "crm_listar_pedidos",
    {
      title: "Pedidos",
      description:
        "Los pedidos con sus renglones de producto y su total, en pesos colombianos.",
      inputSchema: {
        cliente: z.string().optional(),
        estado: z.string().optional(),
        desde: z.string().optional().describe("YYYY-MM-DD, inclusive."),
        hasta: z.string().optional().describe("YYYY-MM-DD, inclusive."),
        limite: z.number().int().min(1).max(200).optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ cliente: referencia, estado, desde, hasta, limite = 30 }) => {
      const { pedidos } = await obtener("/api/pedidos");
      const cliente = referencia ? await resolverCliente(api, referencia) : null;

      const filtrados = pedidos.filter((pedido) => {
        if (cliente && pedido.idClienteCore !== cliente.id) return false;
        if (estado && !contiene(pedido.estado, estado)) return false;
        if (!enRango(pedido.fecha, desde, hasta)) return false;
        return true;
      });

      return respuesta({
        total: filtrados.length,
        mostrados: Math.min(filtrados.length, limite),
        valorTotal: filtrados.reduce(
          (suma, pedido) => suma + (pedido.total ?? 0),
          0,
        ),
        pedidos: filtrados.slice(0, limite).map(resumirPedido),
      });
    },
  );

  servidor.registerTool(
    "crm_listar_productos",
    {
      title: "Catálogo de productos",
      description:
        "El catálogo con precio de lista. El código SIRIUS-PRODUCT-XXXX es lo que piden " +
        "los renglones de un pedido.",
      inputSchema: {
        texto: z
          .string()
          .optional()
          .describe("Filtro por nombre, abreviatura, categoría, tipo o área."),
        soloActivos: z.boolean().optional(),
        limite: z.number().int().min(1).max(200).optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async ({ texto, soloActivos = true, limite = 100 }) => {
      const { productos } = await obtener("/api/productos");

      const filtrados = productos.filter((producto) => {
        if (soloActivos && !producto.activo) return false;
        if (!texto) return true;
        return [
          producto.nombre,
          producto.abreviatura,
          producto.categoria,
          producto.tipo,
          producto.area,
        ].some((campo) => campo && contiene(campo, texto));
      });

      return respuesta({
        total: filtrados.length,
        productos: filtrados.slice(0, limite).map((producto) =>
          limpiar({
            codigo: producto.codigo,
            recordId: producto.recordId,
            nombre: producto.nombre,
            abreviatura: producto.abreviatura,
            categoria: producto.categoria,
            categoriaCpCn: producto.categoriaCpCn,
            tipo: producto.tipo,
            unidad: producto.unidad,
            precio: producto.precio,
            area: producto.area,
            activo: producto.activo,
          }),
        ),
      });
    },
  );

  servidor.registerTool(
    "crm_listar_cotizaciones",
    {
      title: "Cotizaciones",
      description:
        "Las ofertas comerciales emitidas, con sus renglones y su total en pesos " +
        "colombianos. El consecutivo COT-YYYY-NNN identifica el documento; " +
        "`vencida` dice si ya se paso de su vigencia, que es distinto de estar cerrada.",
      inputSchema: {
        cliente: z.string().optional(),
        estado: z.string().optional(),
        soloVencidas: z
          .boolean()
          .optional()
          .describe(
            "Solo las que pasaron su vigencia y nadie cerro: las que hay que perseguir.",
          ),
        desde: z.string().optional().describe("YYYY-MM-DD, inclusive."),
        hasta: z.string().optional().describe("YYYY-MM-DD, inclusive."),
        limite: z.number().int().min(1).max(200).optional(),
      },
      annotations: SOLO_LECTURA,
    },
    async ({
      cliente: referencia,
      estado,
      soloVencidas = false,
      desde,
      hasta,
      limite = 30,
    }) => {
      const { cotizaciones } = await obtener("/api/cotizaciones");
      const cliente = referencia ? await resolverCliente(api, referencia) : null;
      const dia = hoy();

      const filtradas = cotizaciones.filter((cotizacion) => {
        if (cliente && cotizacion.idClienteCore !== cliente.id) return false;
        if (estado && !contiene(cotizacion.estado, estado)) return false;
        if (!enRango(cotizacion.fechaEmision, desde, hasta)) return false;
        if (soloVencidas) {
          if (ESTADOS_COTIZACION_CERRADOS.includes(cotizacion.estado)) {
            return false;
          }
          if (!vencida(cotizacion, dia)) return false;
        }
        return true;
      });

      return respuesta({
        total: filtradas.length,
        mostradas: Math.min(filtradas.length, limite),
        valorTotal: filtradas.reduce(
          (suma, cotizacion) => suma + (cotizacion.total ?? 0),
          0,
        ),
        cotizaciones: filtradas.slice(0, limite).map((cotizacion) => ({
          ...resumirCotizacion(cotizacion),
          vencida: vencida(cotizacion, dia),
        })),
      });
    },
  );
}

/**
 * Si la oferta ya se paso de su vigencia. El dia del vencimiento todavia
 * cuenta como vigente, igual que en el CRM; sin fecha o sin vigencia no se
 * afirma nada, porque una oferta a la que le falta el dato no esta vencida,
 * esta incompleta.
 */
function vencida(cotizacion, dia) {
  if (!cotizacion.fechaEmision || cotizacion.vigenciaDias === null) {
    return false;
  }

  const [anio, mes, d] = cotizacion.fechaEmision.slice(0, 10).split("-").map(Number);
  if (!anio || !mes || !d) return false;

  const fecha = new Date(Date.UTC(anio, mes - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + cotizacion.vigenciaDias);
  return dia > fecha.toISOString().slice(0, 10);
}
