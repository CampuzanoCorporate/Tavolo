/**
 * TAVOLO POS — Modal para Dividir/Separar Cuenta (Split Bill)
 */
import { useState } from 'react';
import type { CartItem } from '../../types';

interface SplitBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableNumber: number;
  sentItems: CartItem[];
  onCobrarSeleccion: (
    selection: Array<{
      productId: number;
      quantity: number;
      notes?: string | null;
      unitPrice: number;
      vatRate: number;
      name: string;
    }>,
    splitMode: 'QUANTITY' | 'PRICE',
    partsCount?: number
  ) => void;
}

export function SplitBillModal({
  isOpen,
  onClose,
  tableNumber,
  sentItems,
  onCobrarSeleccion,
}: SplitBillModalProps) {
  // Modal Mode: 'QUANTITY' (by items) or 'PRICE' (by total amount)
  const [splitMode, setSplitMode] = useState<'QUANTITY' | 'PRICE'>('PRICE'); // Defaulting to price split!
  const [numberOfPeople, setNumberOfPeople] = useState<number>(2);

  // local state for quantity split
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    sentItems.forEach((item) => {
      initial[item.cartKey] = 0;
    });
    return initial;
  });

  if (!isOpen) return null;

  const totalAll = sentItems.reduce((acc, item) => acc + Number(item.price) * item.quantity, 0);

  const handleIncrement = (cartKey: string, maxQty: number) => {
    setSelectedQuantities((prev) => ({
      ...prev,
      [cartKey]: Math.min(maxQty, (prev[cartKey] || 0) + 1),
    }));
  };

  const handleDecrement = (cartKey: string) => {
    setSelectedQuantities((prev) => ({
      ...prev,
      [cartKey]: Math.max(0, (prev[cartKey] || 0) - 1),
    }));
  };

  const handleSelectAll = () => {
    const updated: Record<string, number> = {};
    sentItems.forEach((item) => {
      updated[item.cartKey] = item.quantity;
    });
    setSelectedQuantities(updated);
  };

  const handleClearSelection = () => {
    const updated: Record<string, number> = {};
    sentItems.forEach((item) => {
      updated[item.cartKey] = 0;
    });
    setSelectedQuantities(updated);
  };

  // Greedy Selector Helper for Quantity Mode
  const handleEqualSplit = (parts: number) => {
    if (parts <= 1) return;
    const target = totalAll / parts;
    const newSelection: Record<string, number> = {};
    sentItems.forEach((item) => {
      newSelection[item.cartKey] = 0;
    });

    let currentSum = 0;
    const sortedItems = [...sentItems].sort((a, b) => Number(b.price) - Number(a.price));

    for (const item of sortedItems) {
      const price = Number(item.price);
      if (price === 0) continue;

      for (let q = 1; q <= item.quantity; q++) {
        if (currentSum + price <= target + price / 2) {
          newSelection[item.cartKey] = q;
          currentSum += price;
        } else {
          break;
        }
      }
    }

    const hasAnySelection = Object.values(newSelection).some((q) => q > 0);
    if (!hasAnySelection && sortedItems.length > 0) {
      const cheapest = sortedItems[sortedItems.length - 1];
      newSelection[cheapest.cartKey] = 1;
    }

    setSelectedQuantities(newSelection);
  };

  // Calculate totals for Quantity mode
  let selectionTotal = 0;
  let remainingTotal = 0;
  let hasSelection = false;

  const selectionItemsToClose: Array<{
    productId: number;
    quantity: number;
    notes?: string | null;
    unitPrice: number;
    vatRate: number;
    name: string;
  }> = [];

  sentItems.forEach((item) => {
    const selectedQty = selectedQuantities[item.cartKey] || 0;
    const remainingQty = item.quantity - selectedQty;

    selectionTotal += selectedQty * Number(item.price);
    remainingTotal += remainingQty * Number(item.price);

    if (selectedQty > 0) {
      hasSelection = true;
      selectionItemsToClose.push({
        productId: item.productId,
        quantity: selectedQty,
        notes: item.notes || null,
        unitPrice: Number(item.price),
        vatRate: Number(item.vatRate),
        name: item.name,
      });
    }
  });

  const handleSubmit = () => {
    if (splitMode === 'PRICE') {
      if (!numberOfPeople || numberOfPeople < 2) return;
      // PRICE-based equal split: all items with unitPrice divided by X
      const selection = sentItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes || null,
        unitPrice: Number(item.price) / numberOfPeople,
        vatRate: Number(item.vatRate),
        name: item.name,
      }));
      onCobrarSeleccion(selection, 'PRICE', numberOfPeople);
    } else {
      // QUANTITY-based itemized split
      if (!hasSelection) return;
      onCobrarSeleccion(selectionItemsToClose, 'QUANTITY');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1050 }}>
      <div
        className="modal"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: 640,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div>
            <span
              className="cart__eyebrow"
              style={{ fontSize: '0.72rem', letterSpacing: 1 }}
            >
              Separar Comanda
            </span>
            <h3 className="modal__title" style={{ margin: 0, fontSize: '1.4rem' }}>
              Dividir Cuenta — Mesa {tableNumber}
            </h3>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.8rem',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              lineHeight: 1,
            }}
            aria-label="Cerrar modal"
          >
            ×
          </button>
        </div>

        {/* Selector de Modo (Tabs Premium) */}
        <div
          className="navbar__nav--switcher"
          style={{
            display: 'flex',
            padding: 4,
            background: 'var(--color-surface-2)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <button
            type="button"
            className={`nav-btn ${splitMode === 'PRICE' ? 'active' : ''}`}
            style={{
              flex: 1,
              justifyContent: 'center',
              padding: '8px 16px',
              borderRadius: 'calc(var(--radius-md) - 2px)',
              fontWeight: 700,
            }}
            onClick={() => setSplitMode('PRICE')}
          >
            Dividir por Total (Partes Iguales)
          </button>
          <button
            type="button"
            className={`nav-btn ${splitMode === 'QUANTITY' ? 'active' : ''}`}
            style={{
              flex: 1,
              justifyContent: 'center',
              padding: '8px 16px',
              borderRadius: 'calc(var(--radius-md) - 2px)',
              fontWeight: 700,
            }}
            onClick={() => setSplitMode('QUANTITY')}
          >
            Dividir por Artículos
          </button>
        </div>

        {/* CONTENIDO SEGÚN EL MODO */}
        {splitMode === 'PRICE' ? (
          /* MODO TOTAL EN PARTES IGUALES */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 'var(--space-5)',
              padding: 'var(--space-4) 0',
              animation: 'slideUp 0.15s ease',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <span
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                Total de la mesa
              </span>
              <div
                style={{
                  fontSize: '2.5rem',
                  fontWeight: 800,
                  color: 'var(--color-text-primary)',
                  marginTop: 4,
                }}
              >
                {totalAll.toFixed(2)} €
              </div>
            </div>

            {/* Selector del número de personas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <label
                className="form-label"
                style={{ textAlign: 'center', fontSize: '0.95rem', fontWeight: 700 }}
              >
                ¿Entre cuántas personas dividimos la cuenta?
              </label>

              {/* Botones rápidos y casilla manual */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  flexWrap: 'wrap',
                }}
              >
                {[2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`btn ${numberOfPeople === num ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setNumberOfPeople(num)}
                    style={{
                      width: 54,
                      height: 54,
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {num}
                  </button>
                ))}

                {/* Casilla para introducir a mano */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'var(--space-2)' }}>
                  <label htmlFor="custom-people-input" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    Otro:
                  </label>
                  <input
                    id="custom-people-input"
                    type="number"
                    min="2"
                    max="100"
                    value={numberOfPeople || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) {
                        setNumberOfPeople(val);
                      } else {
                        setNumberOfPeople(0);
                      }
                    }}
                    style={{
                      width: 76,
                      height: 54,
                      fontSize: '1.3rem',
                      fontWeight: 800,
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-text-primary)',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Detalle informativo Verifactu */}
            <div
              style={{
                background: 'var(--color-accent-dim)',
                border: '1px solid rgba(154, 107, 63, 0.2)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                Cobro del comensal (Parte 1 de {(!numberOfPeople || numberOfPeople < 2) ? '?' : numberOfPeople})
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: 'var(--color-accent)',
                  marginTop: 4,
                }}
              >
                {(!numberOfPeople || numberOfPeople < 2) ? '0.00 €' : `${(totalAll / numberOfPeople).toFixed(2)} €`}
              </div>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--color-text-muted)',
                  marginTop: 'var(--space-2)',
                  lineHeight: 1.4,
                  marginInline: 'auto',
                  maxWidth: '85%',
                }}
              >
                Se generará un ticket legal con todos los productos consumidos prorrateados a{' '}
                <strong>1/{(!numberOfPeople || numberOfPeople < 2) ? '?' : numberOfPeople}</strong> del precio unitario original.
              </p>
            </div>
          </div>
        ) : (
          /* MODO DETALLE POR ARTÍCULOS */
          <>
            {/* Acciones Rápidas y División Equitativa */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                animation: 'fadeIn 0.1s ease',
              }}
            >
              {/* Lado Izquierdo: Selección Rápida */}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  id="btn-split-all"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleSelectAll}
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  Todo
                </button>
                <button
                  id="btn-split-clear"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleClearSelection}
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                >
                  Limpiar
                </button>
              </div>

              {/* Lado Derecho: Dividir en Personas */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Sugerir comensal:
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[2, 3, 4, 5].map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => handleEqualSplit(x)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        minWidth: 32,
                        fontSize: '0.8rem',
                        padding: '6px 10px',
                        fontWeight: 700,
                      }}
                      title={`Seleccionar sugerencia de 1/${x} de artículos`}
                    >
                      1/{x}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Lista de productos con scroll */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                marginBottom: 'var(--space-4)',
                paddingRight: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                animation: 'fadeIn 0.1s ease',
              }}
            >
              {sentItems.map((item) => {
                const selectedQty = selectedQuantities[item.cartKey] || 0;
                const isRowSelected = selectedQty > 0;

                return (
                  <div
                    key={item.cartKey}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: isRowSelected
                        ? '1px solid var(--color-accent)'
                        : '1px solid var(--color-border)',
                      background: isRowSelected
                        ? 'var(--color-accent-dim)'
                        : 'var(--color-surface-2)',
                      transition: 'all 0.15s ease',
                      gap: 'var(--space-4)',
                    }}
                  >
                    {/* Nombre y Detalles */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontWeight: 700,
                          color: 'var(--color-text-primary)',
                          fontSize: '0.95rem',
                        }}
                      >
                        {item.name}
                      </p>
                      {item.displayNotes && (
                        <p
                          style={{
                            margin: '2px 0 0 0',
                            fontSize: '0.75rem',
                            color: 'var(--color-text-secondary)',
                            fontStyle: 'italic',
                          }}
                        >
                          {item.displayNotes}
                        </p>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          gap: 'var(--space-2)',
                          marginTop: 4,
                          fontSize: '0.8rem',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        <span>
                          Total: <strong>{item.quantity}</strong>
                        </span>
                        <span>·</span>
                        <span>{Number(item.price).toFixed(2)} €/ud</span>
                      </div>
                    </div>

                    {/* Controles de Selección Táctil */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => handleDecrement(item.cartKey)}
                          disabled={selectedQty === 0}
                          className="cart-item__qty-btn"
                          style={{
                            width: 38,
                            height: 38,
                            fontSize: '1.2rem',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          aria-label={`Restar ${item.name}`}
                        >
                          −
                        </button>
                        <span
                          style={{
                            fontSize: '1.15rem',
                            fontWeight: 800,
                            minWidth: 32,
                            textAlign: 'center',
                            color: isRowSelected
                              ? 'var(--color-accent)'
                              : 'var(--color-text-muted)',
                          }}
                        >
                          {selectedQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIncrement(item.cartKey, item.quantity)}
                          disabled={selectedQty >= item.quantity}
                          className="cart-item__qty-btn"
                          style={{
                            width: 38,
                            height: 38,
                            fontSize: '1.2rem',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          aria-label={`Sumar ${item.name}`}
                        >
                          +
                        </button>
                      </div>

                      {/* Subtotal seleccionado */}
                      <span
                        style={{
                          fontSize: '1rem',
                          fontWeight: 800,
                          minWidth: 70,
                          textAlign: 'right',
                          color: isRowSelected
                            ? 'var(--color-text-primary)'
                            : 'var(--color-text-muted)',
                        }}
                      >
                        {(selectedQty * Number(item.price)).toFixed(2)} €
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Panel de Totales de la Selección */}
            <div
              style={{
                background: 'var(--color-surface-3)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.85rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <span>Total Pendiente (Mesa)</span>
                <span style={{ fontWeight: 600 }}>{remainingTotal.toFixed(2)} €</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: 'var(--color-accent)',
                  borderTop: '1px dashed var(--color-border)',
                  paddingTop: 'var(--space-2)',
                  marginTop: 'var(--space-1)',
                }}
              >
                <span>Total Selección</span>
                <span>{selectionTotal.toFixed(2)} €</span>
              </div>
            </div>
          </>
        )}

        {/* Acciones del Modal */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ flex: 1, minHeight: 48 }}
          >
            Cancelar
          </button>
          <button
            id="btn-confirm-split-cobrar"
            type="button"
            className="btn btn-pay"
            onClick={handleSubmit}
            disabled={
              (splitMode === 'QUANTITY' && !hasSelection) ||
              (splitMode === 'PRICE' && (!numberOfPeople || numberOfPeople < 2))
            }
            style={{ flex: 1, minHeight: 48, fontWeight: 700 }}
          >
            {splitMode === 'PRICE' ? 'Cobrar Parte' : 'Cobrar Selección'}
          </button>
        </div>
      </div>
    </div>
  );
}
