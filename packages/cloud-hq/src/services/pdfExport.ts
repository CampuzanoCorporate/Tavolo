import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { VenueDetailData } from '../types';

export function exportVenuePDF(data: VenueDetailData) {
  const doc = new jsPDF();

  // Header Banner
  doc.setFillColor(61, 44, 31); // Warm Tavolo Espresso
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`TAVOLO POS — INFORME DE SEDE: ${data.venue.name.toUpperCase()}`, 14, 18);

  // Subheader
  doc.setTextColor(61, 44, 31);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cliente / Organización: ${data.venue.organisationName} (NIF: ${data.venue.organisationNif})`, 14, 36);
  doc.text(`Serie de Facturación: ${data.venue.invoiceSeries} | Identificador Sede: ${data.venue.slug}`, 14, 43);
  doc.text(`Fecha del Reporte: ${new Date().toLocaleString('es-ES')}`, 14, 50);

  // Stats Table
  autoTable(doc, {
    startY: 56,
    head: [['Métrica de Facturación & AEAT', 'Valor / Importe']],
    body: [
      ['Total Facturado Bruto (con IVA)', `${data.stats.totalBilled.toFixed(2)} €`],
      ['Total Facturas / Tickets Emitidos', `${data.stats.totalTickets} facturas`],
      ['Facturas Aceptadas AEAT (Veri*Factu)', `${data.stats.acceptedCount}`],
      ['Facturas Pendientes de Envío', `${data.stats.pendingCount}`],
      ['Facturas con Fallo o Rechazo AEAT', `${data.stats.errorCount}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [154, 107, 63], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9.5 },
  });

  // Tickets Table Header
  const lastY = (doc as any).lastAutoTable.finalY || 100;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Registro de Facturas Emitidas en esta Sede', 14, lastY + 12);

  autoTable(doc, {
    startY: lastY + 16,
    head: [['Código Factura', 'Fecha / Hora', 'Forma Pago', 'Total (€)', 'Estado AEAT', 'Mensaje AEAT']],
    body: data.tickets.map((t) => [
      t.invoiceCode,
      new Date(t.issuedAt).toLocaleString('es-ES'),
      t.paymentMethod,
      `${t.total.toFixed(2)} €`,
      t.aeatStatus,
      t.aeatResponseMsg ?? 'Sin incidencias',
    ]),
    theme: 'striped',
    headStyles: { fillColor: [61, 44, 31], textColor: [255, 255, 255] },
    styles: { fontSize: 8 },
  });

  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(120, 100, 85);
  doc.text('Informe emitido por Tavolo Cloud HQ — Conforme al Reglamento Veri*Factu (RD 1007/2023)', 14, pageHeight - 10);

  doc.save(`Informe_Sede_${data.venue.slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
