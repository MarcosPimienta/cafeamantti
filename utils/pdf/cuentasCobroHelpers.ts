/**
 * Helper to convert numbers to text representation in Spanish.
 * Standard for legal invoices and Cuentas de Cobro in Colombia.
 */
export function numeroALetras(num: number): string {
  const Unidades = (num: number) => {
    switch (num) {
      case 1: return 'UN';
      case 2: return 'DOS';
      case 3: return 'TRES';
      case 4: return 'CUATRO';
      case 5: return 'CINCO';
      case 6: return 'SEIS';
      case 7: return 'SIETE';
      case 8: return 'OCHO';
      case 9: return 'NUEVE';
      default: return '';
    }
  };

  const Decenas = (num: number) => {
    const decena = Math.floor(num / 10);
    const unidad = num - (decena * 10);
    switch (decena) {
      case 1:
        switch (unidad) {
          case 0: return 'DIEZ';
          case 1: return 'ONCE';
          case 2: return 'DOCE';
          case 3: return 'TRECE';
          case 4: return 'CATORCE';
          case 5: return 'QUINCE';
          default: return 'DIECI' + Unidades(unidad);
        }
      case 2:
        if (unidad === 0) return 'VEINTE';
        return 'VEINTI' + Unidades(unidad);
      case 3: return DecenasY('TREINTA', unidad);
      case 4: return DecenasY('CUARENTA', unidad);
      case 5: return DecenasY('CINCUENTA', unidad);
      case 6: return DecenasY('SESENTA', unidad);
      case 7: return DecenasY('SETENTA', unidad);
      case 8: return DecenasY('OCHENTA', unidad);
      case 9: return DecenasY('NOVENTA', unidad);
      case 0: return Unidades(unidad);
    }
    return '';
  };

  const DecenasY = (strSin: string, numUnidad: number) => {
    if (numUnidad > 0) return strSin + ' Y ' + Unidades(numUnidad);
    return strSin;
  };

  const Centenas = (num: number) => {
    const centena = Math.floor(num / 100);
    const decena = num - (centena * 100);
    switch (centena) {
      case 1:
        if (decena > 0) return 'CIENTO ' + Decenas(decena);
        return 'CIEN';
      case 2: return 'DOSCIENTOS ' + Decenas(decena);
      case 3: return 'TRESCIENTOS ' + Decenas(decena);
      case 4: return 'CUATROCIENTOS ' + Decenas(decena);
      case 5: return 'QUINIENTOS ' + Decenas(decena);
      case 6: return 'SEISCIENTOS ' + Decenas(decena);
      case 7: return 'SETECIENTOS ' + Decenas(decena);
      case 8: return 'OCHOCIENTOS ' + Decenas(decena);
      case 9: return 'NOVECIENTOS ' + Decenas(decena);
      case 0: return Decenas(decena);
    }
    return '';
  };

  const Seccion = (num: number, divisor: number, strSingular: string, strPlural: string) => {
    const cientos = Math.floor(num / divisor);
    const resto = num - (cientos * divisor);
    let letras = '';
    if (cientos > 0) {
      if (cientos > 1) letras = Centenas(cientos) + ' ' + strPlural;
      else letras = strSingular;
    }
    if (resto > 0) letras += '';
    return letras;
  };

  const Miles = (num: number) => {
    const divisor = 1000;
    const cientos = Math.floor(num / divisor);
    const resto = num - (cientos * divisor);
    const strMiles = Seccion(num, divisor, 'UN MIL', 'MIL');
    const strCentenas = Centenas(resto);
    if (strMiles === '') return strCentenas;
    return strMiles + ' ' + strCentenas;
  };

  const Millones = (num: number) => {
    const divisor = 1000000;
    const miles = Math.floor(num / divisor);
    const resto = num - (miles * divisor);
    const strMillones = Seccion(num, divisor, 'UN MILLÓN', 'MILLONES');
    const strMiles = Miles(resto);
    if (strMillones === '') return strMiles;
    return strMillones + ' ' + strMiles;
  };

  const cleanNum = Math.floor(num);
  if (cleanNum === 0) return 'CERO PESOS M/CTE';
  if (cleanNum === 1) return 'UN PESO M/CTE';
  
  return (Millones(cleanNum) + ' PESOS M/CTE').replace(/\s+/g, ' ').trim();
}

/**
 * Format currency to COP
 */
export function formatCOP(val: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val);
}
