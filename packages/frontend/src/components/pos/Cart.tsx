/**
 * TAVOLO POS — Carrito / Ticket de Venta
 */
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { ModifierModal } from './ModifierModal';
import type { CartItem, CartSummary, MenuCourseTag } from '../../types';
import { decodeMenuSelection } from '../../utils/menuSelection';

interface CartProps {
  summary: CartSummary;
  onSendOrder: () => void;
  onCloseTicket: () => void;
  isClosingTicket: boolean;
  hasActiveOrder: boolean;
  onCancelSentItem?: (productId: number, orderItemId: number, quantityToCancel: number) => void;
  onCancelAndFreeTable?: () => void;
  onRequestMenuCourse?: (item: CartItem, course: MenuCourseTag) => void;
}

export function Cart({
  summary,
  onSendOrder,
  onCloseTicket,
  isClosingTicket,
  hasActiveOrder,
  onCancelSentItem,
  onCancelAndFreeTable,
  onRequestMenuCourse,
}: CartProps) {
  const { updateQuantity, updateNotes, clearCart, removeFromCart } = useAppStore();
  // removeFromCart available for future swipe-to-delete feature
  const [editingNotesFor, setEditingNotesFor] = useState<string | null>(null);
  const [selectedCartKey, setSelectedCartKey] = useState<string | null>(null);

  const editingItem = editingNotesFor !== null
    ? summary.items.find((i) => i.cartKey === editingNotesFor)
    : null;
  const selectedItem = selectedCartKey !== null
    ? summary.items.find((i) => i.cartKey === selectedCartKey)
    : null;
  const selectedMenuSelection = decodeMenuSelection(selectedItem?.notes);

  const sentItems = summary.items.filter((i) => i.sent);
  const pendingItems = summary.items.filter((i) => !i.sent);

  return (
    <>
      <aside className="cart" aria-label="Carrito del pedido">
        {/* Cabecera */}
        <div className="cart__header">
          <h2 className="cart__title">Ticket</h2>
          {summary.itemCount > 0 && (
            <span className="cart__count-badge">{summary.itemCount}</span>
          )}
          {(summary.itemCount > 0 || hasActiveOrder) && (
            <button
              id="btn-clear-cart"
              className="btn btn-danger"
              onClick={() => {
                if (hasActiveOrder && onCancelAndFreeTable) {
                  if (window.confirm('¿Seguro que quieres liberar la mesa? Se anulará el ticket activo sin enviar cancelación a cocina.')) {
                    onCancelAndFreeTable();
                  }
                  return;
                }
                clearCart();
              }}
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
              aria-label={hasActiveOrder ? 'Liberar mesa' : 'Limpiar carrito'}
            >
              {hasActiveOrder ? 'Liberar mesa' : 'Vaciar'}
            </button>
          )}
        </div>

        {/* Items */}
        <div className="cart__items">
          {summary.items.length === 0 ? (
            <div className="cart__empty">
              <p>El ticket está vacío</p>
              <p style={{ fontSize: '0.75rem' }}>Toca un producto para añadir</p>
            </div>
          ) : (
            <>
              {selectedItem && (
                <div className="cart-selection-bar">
                  <div className="cart-selection-bar__content">
                    <span className="cart-selection-bar__label">Línea seleccionada</span>
                    <span className="cart-selection-bar__name">{selectedItem.name}</span>
                  </div>
                  <div className="cart-selection-bar__actions">
                    {!selectedItem.sent && (
                      <>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setEditingNotesFor(selectedItem.cartKey)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => {
                            removeFromCart(selectedItem.cartKey);
                            setSelectedCartKey(null);
                          }}
                        >
                          Eliminar línea
                        </button>
                      </>
                    )}
                    {selectedItem.sent && selectedItem.orderItemId && (
                      <>
                        {selectedMenuSelection?.includeFirst && selectedMenuSelection.courses.FIRST && !selectedMenuSelection.courses.FIRST.sent && (
                          <button className="btn btn-secondary" onClick={() => onRequestMenuCourse?.(selectedItem, 'FIRST')}>
                            Pedir primero
                          </button>
                        )}
                        {selectedMenuSelection?.includeSecond && selectedMenuSelection.courses.SECOND && !selectedMenuSelection.courses.SECOND.sent && (
                          <button className="btn btn-secondary" onClick={() => onRequestMenuCourse?.(selectedItem, 'SECOND')}>
                            Pedir segundo
                          </button>
                        )}
                        {selectedMenuSelection?.finalMode === 'DESSERT_ONLY' && !selectedMenuSelection.courses.DESSERT?.sent && (
                          <button className="btn btn-secondary" onClick={() => onRequestMenuCourse?.(selectedItem, 'DESSERT')}>
                            {selectedMenuSelection.courses.DESSERT?.productId ? 'Pedir postre' : 'Elegir postre'}
                          </button>
                        )}
                        {selectedMenuSelection?.finalMode === 'DESSERT_OR_COFFEE' && !selectedMenuSelection.courses.DESSERT?.sent && !selectedMenuSelection.courses.COFFEE?.sent && (
                          <button className="btn btn-secondary" onClick={() => onRequestMenuCourse?.(selectedItem, 'DESSERT')}>
                            {selectedMenuSelection.courses.DESSERT?.productId || selectedMenuSelection.courses.COFFEE?.productId ? 'Pedir postre/café' : 'Elegir postre o café'}
                          </button>
                        )}
                        {selectedMenuSelection?.finalMode === 'DESSERT_AND_COFFEE' && !selectedMenuSelection.courses.DESSERT?.sent && (
                          <button className="btn btn-secondary" onClick={() => onRequestMenuCourse?.(selectedItem, 'DESSERT')}>
                            {selectedMenuSelection.courses.DESSERT?.productId ? 'Pedir postre' : 'Elegir postre'}
                          </button>
                        )}
                        {selectedMenuSelection?.finalMode === 'DESSERT_AND_COFFEE' && !selectedMenuSelection.courses.COFFEE?.sent && (
                          <button className="btn btn-secondary" onClick={() => onRequestMenuCourse?.(selectedItem, 'COFFEE')}>
                            {selectedMenuSelection.courses.COFFEE?.productId ? 'Pedir café' : 'Elegir café'}
                          </button>
                        )}
                        <button
                          className="btn btn-danger"
                          onClick={() => {
                            onCancelSentItem?.(selectedItem.productId, selectedItem.orderItemId!, selectedItem.quantity);
                            setSelectedCartKey(null);
                          }}
                        >
                          Cancelar línea
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Artículos Enviados */}
              {sentItems.map((item) => (
                <div
                  key={item.cartKey}
                  className={`cart-item cart-item--sent ${selectedCartKey === item.cartKey ? 'cart-item--selected' : ''}`}
                  style={{ borderLeft: '3px solid #10B981' }}
                  onClick={() => setSelectedCartKey(item.cartKey)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedCartKey(item.cartKey);
                    }
                  }}
                >
                  {/* Controles de cantidad */}
                  <div className="cart-item__qty-controls">
                    <button
                      className="cart-item__qty-btn"
                      onClick={() => {
                        setSelectedCartKey(item.cartKey);
                        if (item.orderItemId) {
                          onCancelSentItem?.(item.productId, item.orderItemId, 1);
                        }
                      }}
                      aria-label="Reducir cantidad / Cancelar en cocina"
                    >
                      −
                    </button>
                    <span className="cart-item__qty">{item.quantity}</span>
                    <button
                      className="cart-item__qty-btn"
                      disabled
                      style={{ opacity: 0.3, cursor: 'not-allowed' }}
                      aria-label="Aumentar cantidad (Enviado)"
                    >
                      +
                    </button>
                  </div>

                  {/* Info del producto */}
                  <div className="cart-item__info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <p className="cart-item__name">{item.name}</p>
                      <span className="badge-sent" style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        color: '#10B981',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        display: 'inline-flex'
                      }}>
                        Enviado
                      </span>
                    </div>
                    {item.notes && (
                      <p className="cart-item__notes">{item.displayNotes ?? item.notes}</p>
                    )}
                  </div>

                  {/* Precio y cancelacion completa */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="cart-item__price">
                      {(Number(item.price) * item.quantity).toFixed(2)} €
                    </span>
                    <button
                      className="cart-item__cancel-btn"
                      onClick={() => {
                        setSelectedCartKey(item.cartKey);
                        if (item.orderItemId) {
                          onCancelSentItem?.(item.productId, item.orderItemId, item.quantity);
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-danger, #ef4444)',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s',
                      }}
                      aria-label={`Cancelar todos los ${item.name}`}
                      title="Cancelar línea completa"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}

              {/* Artículos Pendientes de Enviar */}
              {pendingItems.map((item) => (
                <div
                  key={item.cartKey}
                  className={`cart-item ${selectedCartKey === item.cartKey ? 'cart-item--selected' : ''}`}
                  onClick={() => setSelectedCartKey(item.cartKey)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedCartKey(item.cartKey);
                    }
                  }}
                >
                  {/* Controles de cantidad */}
                  <div className="cart-item__qty-controls">
                    <button
                      className="cart-item__qty-btn"
                      onClick={() => {
                        setSelectedCartKey(item.cartKey);
                        updateQuantity(item.cartKey, item.quantity - 1);
                      }}
                      aria-label="Reducir cantidad"
                    >
                      −
                    </button>
                    <span className="cart-item__qty">{item.quantity}</span>
                    <button
                      className="cart-item__qty-btn"
                      onClick={() => {
                        setSelectedCartKey(item.cartKey);
                        updateQuantity(item.cartKey, item.quantity + 1);
                      }}
                      aria-label="Aumentar cantidad"
                    >
                      +
                    </button>
                  </div>

                  {/* Info del producto */}
                  <div className="cart-item__info">
                    <p className="cart-item__name">{item.name}</p>
                    {item.notes && (
                      <p className="cart-item__notes">{item.displayNotes ?? item.notes}</p>
                    )}
                  </div>

                  {/* Precio y nota */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="cart-item__price">
                      {(Number(item.price) * item.quantity).toFixed(2)} €
                    </span>
                    <button
                      className="cart-item__note-btn"
                      onClick={() => {
                        setSelectedCartKey(item.cartKey);
                        setEditingNotesFor(item.cartKey);
                      }}
                      aria-label={`Añadir nota a ${item.name}`}
                      title="Añadir nota/modificador"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Totales */}
        {summary.items.length > 0 && (
          <div className="cart__totals">
            <div className="cart__total-row">
              <span>Base imponible</span>
              <span>{Number(summary.subtotal).toFixed(2)} €</span>
            </div>
            <div className="cart__total-row">
              <span>IVA (10%)</span>
              <span>{Number(summary.vatAmount).toFixed(2)} €</span>
            </div>
            <div className="cart__total-row total">
              <span>TOTAL</span>
              <span className="amount">{Number(summary.total).toFixed(2)} €</span>
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="cart__actions">
          <button
            id="btn-send-order"
            className="btn btn-send-kitchen btn-full"
            onClick={onSendOrder}
            disabled={summary.items.length === 0}
          >
            Enviar a cocina
          </button>

          <button
            id="btn-close-ticket"
            className="btn btn-pay btn-full btn-lg"
            onClick={onCloseTicket}
            disabled={isClosingTicket || (!hasActiveOrder && summary.items.length === 0)}
          >
            {isClosingTicket ? (
              'Procesando...'
            ) : (
              `Cobrar ${summary.total > 0 ? `${Number(summary.total).toFixed(2)} €` : ''}`
            )}
          </button>
        </div>
      </aside>

      {/* Modal de modificadores */}
      {editingItem && (
        <ModifierModal
          productName={editingItem.name}
          currentNotes={editingItem.notes}
          onSave={(notes) => {
            updateNotes(editingItem.cartKey, notes);
            setEditingNotesFor(null);
          }}
          onClose={() => setEditingNotesFor(null)}
        />
      )}
    </>
  );
}
