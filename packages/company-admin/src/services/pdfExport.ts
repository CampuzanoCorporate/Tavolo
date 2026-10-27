import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface QuarterlyReportData {
  year: number;
  quarter: number;
  start: string;
  end: string;
  ticketCount: number;
  billedTotal: number;
  netTotal: number;
  vatAmount: number;
  monthlyBreakdown: Array<{
    label: string;
    billedTotal: number;
    ticketCount: number;
    vatAmount: number;
  }>;
  venueBreakdown: Array<{
    venueId: number;
    venueName: string;
    billedTotal: number;
    ticketCount: number;
    vatAmount: number;
  }>;
}

export interface CashClosureItem {
  id: number;
  periodStart: string;
  periodEnd: string;
  ticketCount: number;
  billedTotal: number;
  openingAmount: number;
  cashSalesTotal?: number;
  cardSalesTotal?: number;
  user?: { name: string };
  venue?: { name: string };
}

export interface TicketItem {
  id: number;
  invoiceCode: string;
  total: number;
  paymentMethod: string;
  aeatStatus: string;
  issuedAt: string;
  subtotal?: number;
  vatAmount?: number;
}

export function exportQuarterlyReportPDF(report: QuarterlyReportData, orgName = 'Tavolo POS Cliente') {
  const doc = new jsPDF();

  // Header Banner
  doc.setFillColor(61, 44, 31); // Warm Tavolo Espresso
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('TAVOLO POS — INFORME TRIMESTRAL DE VENTAS', 14, 18);

  // Subheader Info
  doc.setTextColor(61, 44, 31);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Empresa / Organización: ${orgName}`, 14, 36);
  doc.text(`Período Fiscal: Trimestre ${report.quarter} (Q${report.quarter}) — Año ${report.year}`, 14, 43);
  doc.text(`Fecha del Informe: ${new Date().toLocaleDateString('es-ES')}`, 14, 50);

  // Summary Metrics Table
  autoTable(doc, {
    startY: 56,
    head: [['Métrica Fiscal / Contable', 'Importe / Cantidad']],
    body: [
      ['Total Facturado Bruto (con IVA)', `${report.billedTotal.toFixed(2)} €`],
      ['Base Imponible Neta (Subtotal)', `${report.netTotal.toFixed(2)} €`],
      ['Cuota Total IVA Acumulada', `${report.vatAmount.toFixed(2)} €`],
      ['Total Facturas Simplificadas Expedidas', `${report.ticketCount} facturas`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [154, 107, 63], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 10 },
  });

  // Monthly Breakdown Table
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  const lastY = (doc as any).lastAutoTable.finalY || 100;
  doc.text('Desglose Mensual del Trimestre', 14, lastY + 12);

  autoTable(doc, {
    startY: lastY + 16,
    head: [['Mes / Período', 'Facturas', 'Cuota IVA (€)', 'Total Facturado (€)']],
    body: report.monthlyBreakdown.map((m) => [
      m.label,
      m.ticketCount,
      `${m.vatAmount.toFixed(2)} €`,
      `${m.billedTotal.toFixed(2)} €`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [61, 44, 31], textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
  });

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(120, 100, 85);
  doc.text('Informe generado por Tavolo POS — Conforme al Reglamento Veri*Factu (RD 1007/2023)', 14, pageHeight - 10);

  doc.save(`Informe_Trimestral_${report.year}_T${report.quarter}.pdf`);
}

export function exportCashClosuresPDF(closures: CashClosureItem[], totals: { billedTotal: number; ticketCount: number }) {
  const doc = new jsPDF();

  // Header Banner
  doc.setFillColor(61, 44, 31);
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('TAVOLO POS — HISTÓRICO DE CIERRES DE CAJA', 14, 18);

  // Info
  doc.setTextColor(61, 44, 31);
  doc.setFontSize(10);
  doc.text(`Fecha de Emisión: ${new Date().toLocaleString('es-ES')}`, 14, 36);
  doc.text(`Total Facturado Acumulado en Cierres: ${totals.billedTotal.toFixed(2)} € (${totals.ticketCount} tickets)`, 14, 43);

  // Table
  autoTable(doc, {
    startY: 50,
    head: [['Fecha y Hora Cierre', 'Sede / Local', 'Responsable', 'Apertura (€)', 'Efectivo (€)', 'Tarjeta (€)', 'Total (€)']],
    body: closures.map((c) => [
      new Date(c.periodEnd).toLocaleString('es-ES'),
      c.venue?.name ?? 'Sede Principal',
      c.user?.name ?? 'Administrador',
      `${Number(c.openingAmount).toFixed(2)} €`,
      `${Number(c.cashSalesTotal ?? 0).toFixed(2)} €`,
      `${Number(c.cardSalesTotal ?? 0).toFixed(2)} €`,
      `${Number(c.billedTotal).toFixed(2)} €`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [154, 107, 63], textColor: [255, 255, 255] },
    styles: { fontSize: 8.5 },
  });

  doc.save(`Listado_Cierres_Caja_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportTicketsPDF(tickets: TicketItem[], title = 'LISTADO DE VENTAS Y FACTURAS') {
  const doc = new jsPDF();

  doc.setFillColor(61, 44, 31);
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`TAVOLO POS — ${title}`, 14, 18);

  doc.setTextColor(61, 44, 31);
  doc.setFontSize(10);
  doc.text(`Fecha del Reporte: ${new Date().toLocaleString('es-ES')}`, 14, 36);
  doc.text(`Total Registros: ${tickets.length} facturas emitidas`, 14, 43);

  autoTable(doc, {
    startY: 50,
    head: [['Código Factura', 'Fecha / Hora', 'Forma Pago', 'Estado AEAT', 'Total (€)']],
    body: tickets.map((t) => [
      t.invoiceCode,
      new Date(t.issuedAt).toLocaleString('es-ES'),
      t.paymentMethod,
      t.aeatStatus,
      `${Number(t.total).toFixed(2)} €`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [154, 107, 63], textColor: [255, 255, 255] },
    styles: { fontSize: 8.5 },
  });

  doc.save(`Registro_Ventas_${new Date().toISOString().slice(0, 10)}.pdf`);
}
