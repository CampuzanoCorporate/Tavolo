/**
 * TAVOLO POS — Modal de Modificadores / Notas de Producto
 * Permite al camarero añadir instrucciones especiales al producto.
 * Ejemplos: "sin sal", "muy hecho", "sin cebolla", "alérgico a gluten"
 */
import { useState, useEffect, useRef } from 'react';

const QUICK_NOTES = [
  'Sin sal',
  'Muy hecho',
  'Poco hecho',
  'Al punto',
  'Sin gluten',
  'Sin cebolla',
  'Sin lactosa',
  'Extra picante',
  'Alérgico a frutos secos',
  'Para niño',
  'Sin guarnición',
];

interface ModifierModalProps {
  productName: string;
  currentNotes?: string;
  onSave: (notes: string) => void;
  onClose: () => void;
}

export function ModifierModal({
  productName,
  currentNotes,
  onSave,
  onClose,
}: ModifierModalProps) {
  const [notes, setNotes] = useState(currentNotes ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Auto-focus al textarea al abrir
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && e.ctrlKey) onSave(notes.trim());
  };

  const addQuickNote = (note: string) => {
    setNotes((prev) => {
      if (prev.includes(note)) return prev;
      return prev ? `${prev}, ${note}` : note;
    });
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modifier-modal-title"
    >
      <div className="modal">
        <h3 id="modifier-modal-title" className="modal__title">
          Notas para {productName}
        </h3>

        <label className="modal__label" htmlFor="modifier-textarea">
          Instrucción especial
        </label>
        <textarea
          id="modifier-textarea"
          ref={textareaRef}
          className="modal__textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Ej: "sin sal", "muy hecho", "alérgico a gluten"...'
          maxLength={500}
        />

        {/* Notas rápidas predefinidas */}
        <div style={{ marginTop: 'var(--space-3)', marginBottom: 4 }}>
          <span className="modal__label">Notas rápidas</span>
        </div>
        <div className="modal__quick-notes">
          {QUICK_NOTES.map((note) => (
            <button
              key={note}
              type="button"
              className="modal__quick-note-btn"
              onClick={() => addQuickNote(note)}
              aria-label={`Añadir nota: ${note}`}
            >
              {note}
            </button>
          ))}
        </div>

        {notes && (
          <div style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--color-surface-3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            color: 'var(--color-text-secondary)',
            fontStyle: 'italic',
            marginTop: 'var(--space-2)',
          }}>
            Vista previa: "{notes}"
          </div>
        )}

        <div className="modal__actions">
          <button
            id="btn-modifier-cancel"
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Cancelar
          </button>
          <button
            id="btn-modifier-save"
            type="button"
            className="btn btn-primary"
            onClick={() => onSave(notes.trim())}
            style={{ flex: 2 }}
          >
            Guardar nota
          </button>
        </div>

        <p style={{
          textAlign: 'center',
          fontSize: '0.72rem',
          color: 'var(--color-text-muted)',
          marginTop: 'var(--space-3)',
        }}>
          Ctrl+Enter para guardar · Esc para cancelar
        </p>
      </div>
    </div>
  );
}
