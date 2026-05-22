import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModifierGroup, Product } from '../../types';

interface ProductConfiguratorModalProps {
  product: Product;
  groups: ModifierGroup[];
  onClose: () => void;
  onConfirm: (payload: { price: number; notes: string; modifierSummary: string }) => void;
}

function buildModifierSummary(groups: ModifierGroup[], selections: Record<number, number[]>) {
  return groups
    .map((group) => {
      const selectedOptionNames = group.options
        .filter((option) => (selections[group.id] ?? []).includes(option.id))
        .map((option) => option.name);

      if (selectedOptionNames.length === 0) return '';
      return `${group.name}: ${selectedOptionNames.join(', ')}`;
    })
    .filter(Boolean)
    .join(' | ');
}

export function ProductConfiguratorModal({
  product,
  groups,
  onClose,
  onConfirm,
}: ProductConfiguratorModalProps) {
  const firstInteractiveRef = useRef<HTMLInputElement>(null);
  const [manualNotes, setManualNotes] = useState('');
  const [error, setError] = useState('');
  const [selections, setSelections] = useState<Record<number, number[]>>(() =>
    groups.reduce<Record<number, number[]>>((acc, group) => {
      acc[group.id] = [];
      return acc;
    }, {})
  );

  useEffect(() => {
    firstInteractiveRef.current?.focus();
  }, []);

  const totalPrice = useMemo(() => {
    const extras = groups.reduce((sum, group) => {
      const selectedIds = selections[group.id] ?? [];
      const selectedOptions = group.options.filter((option) => selectedIds.includes(option.id));
      return sum + selectedOptions.reduce((groupSum, option) => groupSum + Number(option.priceDelta), 0);
    }, 0);

    return Number(product.price) + extras;
  }, [groups, product.price, selections]);

  const handleToggle = (group: ModifierGroup, optionId: number) => {
    setSelections((prev) => {
      const current = prev[group.id] ?? [];
      const isSelected = current.includes(optionId);

      if (group.maxSelections === 1) {
        return { ...prev, [group.id]: isSelected ? [] : [optionId] };
      }

      if (isSelected) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }

      if (current.length >= group.maxSelections) {
        return prev;
      }

      return { ...prev, [group.id]: [...current, optionId] };
    });
  };

  const handleConfirm = () => {
    const invalidGroup = groups.find((group) => {
      const selected = selections[group.id] ?? [];
      return selected.length < group.minSelections || selected.length > group.maxSelections;
    });

    if (invalidGroup) {
      setError(`Revisa la selección de "${invalidGroup.name}".`);
      return;
    }

    const modifierSummary = buildModifierSummary(groups, selections);
    const notes = [modifierSummary, manualNotes.trim()].filter(Boolean).join(' | ');
    onConfirm({ price: totalPrice, notes, modifierSummary });
  };

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-configurator-title"
    >
      <div className="modal product-configurator-modal">
        <h3 id="product-configurator-title" className="modal__title">
          Configurar {product.name}
        </h3>

        <div className="product-configurator-modal__groups">
          {groups.map((group, groupIndex) => (
            <section key={group.id} className="product-configurator-modal__group">
              <div className="product-configurator-modal__group-header">
                <div>
                  <p className="product-configurator-modal__group-title">{group.name}</p>
                  <p className="product-configurator-modal__group-hint">
                    {group.maxSelections === 1
                      ? 'Elige una opción'
                      : `Elige hasta ${group.maxSelections} opciones`}
                  </p>
                </div>
              </div>

              <div className="product-configurator-modal__options">
                {group.options.map((option, optionIndex) => {
                  const selected = (selections[group.id] ?? []).includes(option.id);
                  const inputType = group.maxSelections === 1 ? 'radio' : 'checkbox';

                  return (
                    <label
                      key={option.id}
                      className={`product-configurator-modal__option ${selected ? 'selected' : ''}`}
                    >
                      <input
                        ref={groupIndex === 0 && optionIndex === 0 ? firstInteractiveRef : undefined}
                        type={inputType}
                        name={`modifier-group-${group.id}`}
                        checked={selected}
                        onChange={() => handleToggle(group, option.id)}
                      />
                      <span>{option.name}</span>
                      {Number(option.priceDelta) > 0 && (
                        <span className="product-configurator-modal__option-price">
                          +{Number(option.priceDelta).toFixed(2)} €
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="product-config-manual-notes">
            Nota adicional
          </label>
          <textarea
            id="product-config-manual-notes"
            className="modal__textarea"
            rows={2}
            value={manualNotes}
            onChange={(event) => setManualNotes(event.target.value)}
            placeholder="Ej: cortar por la mitad, sin tostar demasiado"
          />
        </div>

        {error && (
          <div className="product-configurator-modal__error">{error}</div>
        )}

        <div className="product-configurator-modal__footer">
          <div className="product-configurator-modal__total">
            {totalPrice.toFixed(2)} €
          </div>
          <div className="modal__actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={handleConfirm} style={{ flex: 2 }}>
              Añadir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
