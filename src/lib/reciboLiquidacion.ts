/**
 * reciboLiquidacion.ts — recibo de liquidación en PDF (Anexo C, 7.4). Es un soporte interno de pago de comisiones:
 * no reemplaza la cuenta de cobro ni la factura. Se genera en el navegador con los datos que ya calculó el servidor.
 */
import { jsPDF } from 'jspdf'

export interface LineaRecibo { tipo: string; restaurante: string | null; fecha_pago: string | null; base_cop: number; porcentaje: number; monto_cop: number; estado: string }
export interface DatosRecibo {
  numero: string; periodo: string; pagada_at: string; medio_pago: string | null; referencia_pago: string | null
  cuenta_cobro_numero: string | null; total_bruto_cop: number; retencion_cop: number; total_pagar_cop: number
  vendedor: { nombre: string; documento: string | null; codigo: string; tipo: string; contrato_version: string | null }
  lineas: LineaRecibo[]
}

const cop = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
const fecha = (s: string | null) => (s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const TIPOS: Record<string, string> = { bono_1: 'Bono 1', bono_2: 'Bono 2', recurrente: 'Mensual', ajuste: 'Ajuste' }

export function generarRecibo(d: DatosRecibo): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 18
  const linea = (txt: string, x = 15, tam = 10, negrita = false) => { doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(tam); doc.text(txt, x, y) }

  linea('RestaurantOS', 15, 11, true); y += 6
  linea('Recibo de liquidación de comisiones', 15, 16, true); y += 8
  linea(`N.º ${d.numero}    Fecha de pago: ${fecha(d.pagada_at)}`); y += 5
  linea(`Periodo: ${new Date(d.periodo + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}`); y += 8

  linea('Beneficiario', 15, 11, true); y += 5
  linea(`${d.vendedor.nombre}  (${d.vendedor.tipo === 'aliado' ? 'Aliado' : 'Vendedor'}, código ${d.vendedor.codigo})`); y += 5
  linea(`Documento: ${d.vendedor.documento ?? '—'}    Contrato: ${d.vendedor.contrato_version ?? '—'}`); y += 8

  linea('Detalle', 15, 11, true); y += 5
  doc.setFontSize(8); doc.setFont('helvetica', 'bold')
  doc.text('Cliente', 15, y); doc.text('Pago', 80, y); doc.text('Concepto', 105, y); doc.text('Base sin IVA', 135, y); doc.text('%', 163, y); doc.text('Comisión', 175, y); y += 4
  doc.setFont('helvetica', 'normal')
  for (const l of d.lineas.filter(x => x.estado !== 'anulada')) {
    if (y > 265) { doc.addPage(); y = 18 }
    doc.text((l.restaurante ?? '—').slice(0, 32), 15, y); doc.text(fecha(l.fecha_pago), 80, y); doc.text(TIPOS[l.tipo] ?? l.tipo, 105, y)
    doc.text(cop(l.base_cop), 135, y); doc.text(String(l.porcentaje), 163, y); doc.text(cop(l.monto_cop), 175, y); y += 4.5
  }
  y += 4
  if (y > 240) { doc.addPage(); y = 18 }
  linea(`Total comisiones: ${cop(d.total_bruto_cop)}`, 15, 10, true); y += 5
  linea(`Retención: ${cop(d.retencion_cop)}`); y += 5
  linea(`Total pagado: ${cop(d.total_pagar_cop)}`, 15, 12, true); y += 7
  linea(`Medio de pago: ${d.medio_pago ?? '—'}    Referencia: ${d.referencia_pago ?? '—'}    Cuenta de cobro: ${d.cuenta_cobro_numero ?? '—'}`, 15, 9); y += 10

  linea(`Recibí a satisfacción el valor de las comisiones del contrato ${d.vendedor.contrato_version ?? ''}.`, 15, 9); y += 14
  doc.line(15, y, 90, y); y += 4
  linea('Firma de quien recibe', 15, 8); y += 12

  doc.setFontSize(7); doc.setTextColor(110)
  doc.text('Este recibo es un soporte interno de pago de comisiones. No reemplaza la cuenta de cobro ni la factura.', 15, 285)
  return doc.output('blob')
}
