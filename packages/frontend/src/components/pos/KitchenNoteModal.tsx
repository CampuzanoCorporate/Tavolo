import { useEffect, useRef, useState } from 'react';
import type { Table } from '../../types';

interface KitchenNoteModalProps {
  tables: Table[];
  initialTableId?: number | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: { tableId: number; message: string }) => void;
}

const ACTIVE_TABLE_STATUSES: Table['status'][] = ['OCCUPIED', 'ORDERING', 'BILL_REQUESTED'];

export function KitchenNoteModal({
  tables,
  initialTableId,
  isSubmitting = false,
  onClose,
  onSubmit,
}: KitchenNoteModalProps) {
  const occupiedTables = tables.filter((table) => ACTIVE_TABLE_STATUSES.includes(table.status));
  const defaultTableId = initialTableId && occupiedTables.some((table) => table.id === initialTableId)
    ? initialTableId
    : occupiedTables[0]?.id;

  const [selectedTableId, setSelectedTableId] = useState<number | ''>(defaultTableId ?? '');
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSelectedTableId(defaultTableId ?? '');
  }, [defaultTableId]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!selectedTableId || !message.trim()) return;
    onSubmit({
      tableId: selectedTableId,
      message: message.trim(),
    });
  };

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kitchen-note-title"
    >
      <div className="modal kitchen-note-modal">
        <h3 id="kitchen-note-title" className="modal__title">Avisar a cocina</h3>

        {occupiedTables.length === 0 ? (
          <>
            <p className="kitchen-note-modal__empty">No hay mesas ocupadas ahora mismo.</p>
            <div className="modal__actions">
              <button type="button" className="btn btn-secondary btn-full" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="kitchen-note-table">Mesa</label>
              <select
                id="kitchen-note-table"
                className="input kitchen-note-modal__select"
                value={selectedTableId}
                onChange={(event) => setSelectedTableId(Number(event.target.value))}
                disabled={isSubmitting}
              >
                {occupiedTables.map((table) => (
                  <option key={table.id} value={table.id}>
                    Mesa {table.number}{table.name ? ` · ${table.name}` : ''}{table.zone ? ` · ${table.zone}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
              <span className="form-label" style={{ display: 'block', marginBottom: '8px' }}>
                Avisos rápidos (pulsa para añadir)
              </span>
              <div style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                maxHeight: 110,
                overflowY: 'auto',
                padding: '6px',
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)'
              }}>
                {[
                  '¡Marcha segundos!',
                  '¡Sacar postres!',
                  '¡Servir todo junto!',
                  'Falta un plato',
                  '¡Prioridad / Urgente!',
                  'Comida para llevar',
                  'Revisar comanda',
                  'Mesa VIP'
                ].map((note) => (
                  <button
                    key={note}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setMessage((prev) => {
                        const trimmed = prev.trim();
                        if (!trimmed) return note;
                        return trimmed + '\n' + note;
                      });
                      textareaRef.current?.focus();
                    }}
                    style={{
                      fontSize: '0.78rem',
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 700,
                      background: 'var(--color-surface-1)',
                      border: '1px solid var(--color-border)',
                      cursor: 'pointer',
                    }}
                    disabled={isSubmitting}
                  >
                    {note}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="kitchen-note-message">Comentario o aviso a mano</label>
              <textarea
                ref={textareaRef}
                id="kitchen-note-message"
                className="modal__textarea kitchen-note-modal__textarea"
                placeholder="Ej. Falta una tapa, sacar antes el postre, revisar una comanda..."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={isSubmitting}
                style={{ minHeight: 90 }}
              />
            </div>

            <div className="modal__actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting} style={{ flex: 1 }}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-send-kitchen"
                onClick={handleSubmit}
                disabled={!selectedTableId || !message.trim() || isSubmitting}
                style={{ flex: 1.4 }}
              >
                {isSubmitting ? 'Enviando...' : 'Enviar aviso'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
