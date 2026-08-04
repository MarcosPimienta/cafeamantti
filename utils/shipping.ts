export interface MetropolitanShippingZone {
  zoneName: string;
  radiusLabel: string;
  rate: number;
  isAvailable: boolean;
  message?: string;
}

export function calculateMetropolitanShipping(state?: string, city?: string): MetropolitanShippingZone {
  if (!state || !city || state.trim() === "" || city.trim() === "") {
    // Default base rate before address entry
    return {
      zoneName: "Área Metropolitana (Base)",
      radiusLabel: "Radio 0–10 km",
      rate: 10000,
      isAvailable: true,
    };
  }

  const normState = state.trim().toLowerCase();
  const normCity = city.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Must be in Antioquia for Metropolitan Area coverage
  if (normState !== "antioquia") {
    return {
      zoneName: "Fuera de Cobertura",
      radiusLabel: "Nacional",
      rate: 0,
      isAvailable: false,
      message: "Entregas de suscripción disponibles actualmente solo en el Área Metropolitana (Valle de Aburrá)."
    };
  }

  // Zone 1: Inner Metro (Radio 0-10 km) -> Medellín, Envigado, Itagüí, Sabaneta
  const innerMetroCities = ["medellin", "envigado", "itagui", "sabaneta"];
  if (innerMetroCities.some(c => normCity.includes(c))) {
    return {
      zoneName: "Núcleo Urbano",
      radiusLabel: "Radio 0–10 km",
      rate: 10000,
      isAvailable: true,
    };
  }

  // Zone 2: Extended Metro (Radio 10-20 km) -> Bello, La Estrella, Caldas, Copacabana
  const extendedMetroCities = ["bello", "la estrella", "caldas", "copacabana"];
  if (extendedMetroCities.some(c => normCity.includes(c))) {
    return {
      zoneName: "Zona Metro Extendida",
      radiusLabel: "Radio 10–20 km",
      rate: 14000,
      isAvailable: true,
    };
  }

  // Zone 3: North Metro (Radio 20-35 km) -> Girardota, Barbosa
  const northMetroCities = ["girardota", "barbosa"];
  if (northMetroCities.some(c => normCity.includes(c))) {
    return {
      zoneName: "Zona Norte Metropolitana",
      radiusLabel: "Radio 20–35 km",
      rate: 18000,
      isAvailable: true,
    };
  }

  // Any other municipality outside Valle de Aburrá
  return {
    zoneName: "Fuera de Cobertura Metropolitana",
    radiusLabel: "Fuera de Rango",
    rate: 0,
    isAvailable: false,
    message: "Entregas disponibles actualmente solo en el Área Metropolitana (Valle de Aburrá)."
  };
}

export function calculateOrderShippingAndTotal(
  items: { price: number; quantity: number }[],
  state?: string,
  city?: string
) {
  const shippingZone = calculateMetropolitanShipping(state, city);

  if (!items || items.length === 0) {
    return {
      netItemsTotal: 0,
      shippingCost: 0,
      totalAmount: 0,
      shippingZone,
    };
  }

  let netItemsTotal = 0;
  for (const item of items) {
    const netUnitPrice = Math.max(0, item.price - 10000);
    netItemsTotal += netUnitPrice * item.quantity;
  }

  const shippingCost = shippingZone.isAvailable ? shippingZone.rate : 10000;
  const totalAmount = netItemsTotal + shippingCost;

  return {
    netItemsTotal,
    shippingCost,
    totalAmount,
    shippingZone,
  };
}

