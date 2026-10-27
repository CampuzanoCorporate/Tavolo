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
  const [showNumpad, setShowNumpad] = useState<boolean>(false);

  const deliveredNum = parseFloat(delivered) || 0;

  useEffect(() => {
    if (method === 'CASH') {
      setDelivered(total.toFixed(2));
    } else {
      setDelivered('');
      setShowNumpad(false);
    }
  }, [method, total]);

  // Calcular el cambio a devolver
  useEffect(() => {
    if (method === 'CASH' && deliveredNum >= total) {
      setChange(Math.max(0, Math.round((deliveredNum - total) * 100) / 100));
    } else {
      setChange(0);
    }
  }, [method, deliveredNum, total]);

  const handleQuickAmount = (amount: number) => {
    setDelivered(amount.toFixed(2));
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
      <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 480 }}>
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
            aria-label="Cerrar"
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
          >
            ×
          </button>
        </div>

        {/* Banner de confirmación del pago anterior si existe */}
        {lastPayment && (
          <div style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: '0.88rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            <div style={{ fontWeight: 700 }}>
              Parte anterior cobrada con éxito
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Ticket: {lastPayment.invoiceCode}</span>
              <span>Total: {Number(lastPayment.total).toFixed(2)} €</span>
            </div>
            {lastPayment.change !== undefined && (
              <div style={{
                marginTop: 4,
                fontSize: '0.9rem',
                fontWeight: 700,
                textAlign: 'center',
                color: 'var(--color-accent)',
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
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Impresión local</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Usa QZ Tray para imprimir en este equipo.
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

            {localPrinting.availablePrinters.length > 0 && (
              <div className="form-group" style={{ marginBottom: 0 }}>
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
            )}
          </div>
        )}

        {/* Total a pagar destacado */}
        <div style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
          marginBottom: 'var(--space-4)'
        }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total a pagar</span>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-accent)', marginTop: 4 }}>
            {total.toFixed(2)} €
          </div>
        </div>

        {/* Selector de método de pago (Botones grandes sobrios sin emoticonos) */}
        <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
          <label className="form-label">Método de pago</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <button
              type="button"
              className={`btn ${method === 'CASH' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                height: 56,
                fontSize: '1.15rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              onClick={() => {
                setMethod('CASH');
                setDelivered(total.toFixed(2));
              }}
            >
              Efectivo
            </button>

            <button
              type="button"
              className={`btn ${method === 'CARD' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                height: 56,
                fontSize: '1.15rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              onClick={() => {
                setMethod('CARD');
              }}
            >
              Tarjeta
            </button>
          </div>
        </div>

        {/* Detalles si es Efectivo */}
        {method === 'CASH' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div className="form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="pay-delivered">Entregado</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="pay-delivered"
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={delivered}
                    onChange={(e) => setDelivered(e.target.value)}
                    onFocus={() => setShowNumpad(true)}
                    placeholder="0.00"
                    style={{ fontSize: '1.15rem', fontWeight: 700, paddingRight: '40px', height: 48 }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontWeight: 600 }}>€</span>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Cambio</label>
                <div style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  height: 48,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 'var(--space-3)',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: isCashInvalid ? 'var(--color-text-muted)' : 'var(--color-accent)'
                }}>
                  {isCashInvalid ? 'Falta importe' : `${change.toFixed(2)} €`}
                </div>
              </div>
            </div>

            {/* Botón para desplegar/ocultar teclado numérico opcional */}
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowNumpad(!showNumpad)}
                style={{ fontSize: '0.82rem', color: 'var(--color-accent)', padding: 0 }}
              >
                {showNumpad ? 'Ocultar teclado' : 'Modificar importe / Billetes...'}
              </button>
            </div>

            {/* Teclado numérico y billetes desplegables solo si showNumpad es true */}
            {showNumpad && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
                <div>
                  <span className="form-label" style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '0.8rem' }}>Atajos de importe</span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleQuickAmount(total)}
                    >
                      Exacto ({total.toFixed(2)} €)
                    </button>
                    {[5, 10, 20, 50, 100].map((val) => (
                      <button
                        key={val}
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleQuickAmount(val)}
                      >
                        {val} €
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 6
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
                          height: 44,
                          fontSize: '1.1rem',
                          fontWeight: 700,
                          borderRadius: 'var(--radius-md)',
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
          </div>
        )}

        {/* BOTONES DE CONFIRMACIÓN */}
        <div className="modal__actions" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', width: '100%' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ flex: 1, height: 52, fontSize: '1.05rem', fontWeight: 700 }}
              disabled={isClosing}
            >
              Cancelar
            </button>
            
            <button
              type="button"
              className="btn btn-pay"
              onClick={() => onConfirm(method, false, method === 'CASH' ? { delivered: deliveredNum, change } : undefined)}
              style={{ flex: 1, height: 52, fontSize: '1.05rem', fontWeight: 700 }}
              disabled={isClosing || isCashInvalid}
            >
              Confirmar (Sin ticket)
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => onConfirm(method, true, method === 'CASH' ? { delivered: deliveredNum, change } : undefined)}
            disabled={isClosing || isCashInvalid}
            style={{
              height: 56,
              fontSize: '1.15rem',
              fontWeight: 800,
            }}
          >
            {isClosing ? 'Emitiendo ticket...' : 'Confirmar e Imprimir (Verifactu)'}
          </button>
        </div>
      </div>
    </div>
  );
}
