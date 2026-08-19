/**
 * TAVOLO POS — Modal de Cobro y Pago
 */
import { useState, useEffect } from 'react';

interface PaymentModalProps {
  total: number;
  tableNumber: number;
  isClosing: boolean;
  onClose: () => void;
  onConfirm: (method: 'CASH' | 'CARD', print: boolean, cashDetails?: { delivered: number; change: number }) => void;
  splitInfo?: {
    current: number;
    total: number;
  };
  lastPayment?: {
    invoiceCode: string;
    total: number;
    change?: number;
  } | null;
  localPrinting?: {
    enabled: boolean;
    printerName: string | null;
    availablePrinters: string[];
    connecting: boolean;
    onRefresh: () => void;
    onChange: (printerName: string | null) => void;
  };
}

export function PaymentModal({
  total,
  tableNumber,
  isClosing,
  onClose,
  onConfirm,
  splitInfo,
  lastPayment,
  localPrinting,
}: PaymentModalProps) {
  const [method, setMethod] = useState<'CASH' | 'CARD'>('CARD');
  const [delivered, setDelivered] = useState<string>('');
  const [change, setChange] = useState<number>(0);

  const deliveredNum = parseFloat(delivered) || 0;

  // Calcular el cambio a devolver
  useEffect(() => {
    if (method === 'CASH' && deliveredNum >= total) {
      setChange(Math.max(0, Math.round((deliveredNum - total) * 100) / 100));
    } else {
      setChange(0);
    }
  }, [method, deliveredNum, total]);

  const handleQuickAmount = (amount: number) => {
    setDelivered(amount.toString());
  };

  const handleKeyPress = (key: string) => {
    if (key === 'CLEAR') {
      setDelivered('');
    } else if (key === 'BACKSPACE') {
      setDelivered((prev) => prev.slice(0, -1));
    } else if (key === '.') {
      setDelivered((prev) => {
        if (prev.includes('.')) return prev;
        if (prev === '') return '0.';
        return prev + '.';
      });
    } else {
      setDelivered((prev) => {
        if (prev.includes('.')) {
          const parts = prev.split('.');
          if (parts[1] && parts[1].length >= 2) return prev;
        }
        if (prev === '0' && key === '0') return prev;
        if (prev === '0' && key !== '0') return key;
        return prev + key;
      });
    }
  };

  const isCashInvalid = method === 'CASH' && deliveredNum < total;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h3 className="modal__title" style={{ margin: 0 }}>
            {splitInfo
              ? `Cobrar Mesa ${tableNumber} — Persona ${splitInfo.current} de ${splitInfo.total}`
              : `Cobrar Mesa ${tableNumber}`}
          </h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Banner de confirmación del pago anterior si existe */}
        {lastPayment && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: '0.88rem',
            color: 'var(--color-success, #10b981)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '1.1rem' }}>✓</span> Parte anterior cobrada con éxito
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Ticket: {lastPayment.invoiceCode}</span>
              <span>Total: {Number(lastPayment.total).toFixed(2)} €</span>
            </div>
            {lastPayment.change !== undefined && (
              <div style={{
                marginTop: 4,
                fontSize: '0.9rem',
                fontWeight: 800,
                background: 'rgba(16, 185, 129, 0.15)',
                padding: '4px 8px',
                borderRadius: 4,
                textAlign: 'center',
                color: 'var(--color-success, #10b981)',
              }}>
                Cambio a devolver: {lastPayment.change.toFixed(2)} €
              </div>
            )}
          </div>
        )}

        {localPrinting && (
          <div
            style={{
              marginBottom: 'var(--space-4)',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <div>
                <div style={{ fontWeight: 700 }}>Impresora local de este equipo</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                  Usa QZ Tray para imprimir en una impresora instalada en este PC.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={localPrinting.onRefresh}
                disabled={localPrinting.connecting}
              >
                {localPrinting.connecting ? 'Buscando...' : 'Detectar'}
              </button>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="local-printer-select">Impresora local</label>
              <select
                id="local-printer-select"
                className="form-select"
                value={localPrinting.printerName ?? ''}
                onChange={(event) => localPrinting.onChange(event.target.value || null)}
              >
                <option value="">No usar impresión local</option>
                {localPrinting.availablePrinters.map((printer) => (
                  <option key={printer} value={printer}>
                    {printer}
                  </option>
                ))}
              </select>
            </div>

            {!localPrinting.enabled && (
              <div style={{ marginTop: 'var(--space-2)', fontSize: '0.82rem', color: 'var(--color-warning, #b45309)' }}>
                Instala y abre QZ Tray en este equipo para habilitar la impresión local.
              </div>
            )}
          </div>
        )}

        {/* Total a pagar destacado */}
        <div style={{
          background: 'var(--color-accent-dim)',
          border: '1px solid rgba(154, 107, 63, 0.25)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
          marginBottom: 'var(--space-4)'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>Importe total</span>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-accent)', marginTop: 4 }}>
            {total.toFixed(2)} €
          </div>
        </div>

        {/* Selector de método de pago */}
        <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="form-label">Método de pago</label>
          <div className="navbar__nav--switcher" style={{ display: 'flex', padding: 4, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className={`nav-btn ${method === 'CARD' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center', padding: '8px 16px', borderRadius: 'calc(var(--radius-md) - 2px)' }}
              onClick={() => setMethod('CARD')}
            >
              Tarjeta
            </button>
            <button
              type="button"
              className={`nav-btn ${method === 'CASH' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center', padding: '8px 16px', borderRadius: 'calc(var(--radius-md) - 2px)' }}
              onClick={() => setMethod('CASH')}
            >
              Efectivo
            </button>
          </div>
        </div>

        {/* Detalles si es Efectivo */}
        {method === 'CASH' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', animation: 'slideUp 0.15s ease' }}>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="pay-delivered">Importe entregado</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="pay-delivered"
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={delivered}
                    onChange={(e) => setDelivered(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    style={{ fontSize: '1.15rem', paddingRight: '48px' }}
                  />
                  {delivered && (
                    <button
                      type="button"
                      onClick={() => setDelivered('')}
                      style={{
                        position: 'absolute',
                        right: 28,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        fontWeight: 700
                      }}
                      title="Limpiar"
                    >
                      C
                    </button>
                  )}
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontWeight: 600 }}>€</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Importe a devolver</label>
                <div style={{
                  background: isCashInvalid ? 'var(--color-surface-2)' : 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid ' + (isCashInvalid ? 'var(--color-border)' : 'rgba(16, 185, 129, 0.3)'),
                  borderRadius: 'var(--radius-md)',
                  height: 42,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 'var(--space-4)',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: isCashInvalid ? 'var(--color-text-muted)' : 'var(--color-success)'
                }}>
                  {isCashInvalid ? 'Falta importe' : `${change.toFixed(2)} €`}
                </div>
              </div>
            </div>

            {/* Atajos de teclado/importes rápidos */}
            <div>
              <span className="form-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Acceso rápido</span>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleQuickAmount(total)}>
                  Exacto
                </button>
                {[5, 10, 20, 50, 100].map((val) => {
                  if (val <= total && val * 2 < total) return null; // Filtrar atajos muy pequeños si el total es muy alto
                  return (
                    <button
                      key={val}
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleQuickAmount(val)}
                    >
                      {val} €
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Teclado numérico táctil */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              marginTop: 'var(--space-2)'
            }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((key) => {
                const isDelete = key === '⌫';
                return (
                  <button
                    key={key}
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleKeyPress(isDelete ? 'BACKSPACE' : key)}
                    style={{
                      height: 48,
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: isDelete ? 'rgba(239, 68, 68, 0.08)' : 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      color: isDelete ? 'var(--color-error)' : 'var(--color-text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      userSelect: 'none'
                    }}
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Acciones de confirmación */}
        <div className="modal__actions" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-5)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', width: '100%' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ flex: 1 }}
              disabled={isClosing}
            >
              Cancelar
            </button>
            
            <button
              type="button"
              className="btn btn-pay"
              onClick={() => onConfirm(method, false, method === 'CASH' ? { delivered: deliveredNum, change } : undefined)}
              style={{ flex: 1 }}
              disabled={isClosing || isCashInvalid}
            >
              Confirmar
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => onConfirm(method, true, method === 'CASH' ? { delivered: deliveredNum, change } : undefined)}
            disabled={isClosing || isCashInvalid}
            style={{ fontWeight: 700 }}
          >
            {isClosing ? 'Confirmando...' : 'Confirmar e Imprimir (Verifactu)'}
          </button>
        </div>
      </div>
    </div>
  );
}
