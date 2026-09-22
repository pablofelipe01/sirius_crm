function required(name: string, value: string | undefined): string {
  const limpio = value?.trim();
  if (!limpio) {
    throw new Error(`Falta la variable de entorno ${name} en .env.local`);
  }
  return limpio;
}

export const env = {
  get airtableApiKey() {
    return required(
      "AIRTABLE_API_KEY",
      process.env.AIRTABLE_API_KEY ?? process.env.API_KEY_SIRIUS_CRM,
    );
  },
  get sessionSecret() {
    return required("SESSION_SECRET", process.env.SESSION_SECRET);
  },

  /* Sirius Nomina Core — usuarios del sistema y áreas de la empresa */
  get baseNomina() {
    return required("AIRTABLE_BASE_ID", process.env.AIRTABLE_BASE_ID);
  },
  get tablaPersonal() {
    return required(
      "AIRTABLE_TABLE_PERSONAL",
      process.env.AIRTABLE_TABLE_PERSONAL,
    );
  },
  get tablaAreas() {
    return required("AIRTABLE_TABLE_AREAS", process.env.AIRTABLE_TABLE_AREAS);
  },

  /* Sirius CRM — visitas y casos */
  get baseCrm() {
    return required("AIRTABLE_BASE_CRM", process.env.AIRTABLE_BASE_CRM);
  },
  get tablaVisitas() {
    return required(
      "AIRTABLE_TABLE_VISITAS",
      process.env.AIRTABLE_TABLE_VISITAS,
    );
  },
  get tablaCasos() {
    return required("AIRTABLE_TABLE_CASOS", process.env.AIRTABLE_TABLE_CASOS);
  },

  /* Sirius Clients Core — ficha de cliente */
  get baseClientes() {
    return required(
      "AIRTABLE_BASE_CLIENTES",
      process.env.AIRTABLE_BASE_CLIENTES,
    );
  },
  get tablaClientes() {
    return required(
      "AIRTABLE_TABLE_CLIENTES",
      process.env.AIRTABLE_TABLE_CLIENTES,
    );
  },
  get tablaPersonalCliente() {
    return required(
      "AIRTABLE_TABLE_PERSONAL_CLIENTE",
      process.env.AIRTABLE_TABLE_PERSONAL_CLIENTE,
    );
  },
  get tablaCultivos() {
    return required(
      "AIRTABLE_TABLE_CULTIVOS",
      process.env.AIRTABLE_TABLE_CULTIVOS,
    );
  },

  /* Sirius Product Core — catálogo */
  get baseProductos() {
    return required(
      "AIRTABLE_BASE_PRODUCTOS",
      process.env.AIRTABLE_BASE_PRODUCTOS,
    );
  },
  get tablaProductos() {
    return required(
      "AIRTABLE_TABLE_PRODUCTOS",
      process.env.AIRTABLE_TABLE_PRODUCTOS,
    );
  },

  /* Sirius Pedidos Core — pedidos y sus líneas de producto */
  get basePedidos() {
    return required("AIRTABLE_BASE_PEDIDOS", process.env.AIRTABLE_BASE_PEDIDOS);
  },
  get tablaPedidos() {
    return required(
      "AIRTABLE_TABLE_PEDIDOS",
      process.env.AIRTABLE_TABLE_PEDIDOS,
    );
  },
  get tablaDetallesPedido() {
    return required(
      "AIRTABLE_TABLE_DETALLES_PEDIDO",
      process.env.AIRTABLE_TABLE_DETALLES_PEDIDO,
    );
  },

  /* Sirius Cotizaciones Core — ofertas comerciales y sus renglones */
  get baseCotizaciones() {
    return required(
      "AIRTABLE_BASE_COTIZACIONES",
      process.env.AIRTABLE_BASE_COTIZACIONES,
    );
  },
  get tablaCotizaciones() {
    return required(
      "AIRTABLE_TABLE_COTIZACIONES",
      process.env.AIRTABLE_TABLE_COTIZACIONES,
    );
  },
  get tablaDetallesCotizacion() {
    return required(
      "AIRTABLE_TABLE_DETALLES_COTIZACION",
      process.env.AIRTABLE_TABLE_DETALLES_COTIZACION,
    );
  },

  /* Sirius Remisiones Core — despacho y entrega de cada pedido */
  get baseRemisiones() {
    return required(
      "AIRTABLE_BASE_REMISIONES",
      process.env.AIRTABLE_BASE_REMISIONES,
    );
  },
  get tablaRemisiones() {
    return required(
      "AIRTABLE_TABLE_REMISIONES",
      process.env.AIRTABLE_TABLE_REMISIONES,
    );
  },
};
