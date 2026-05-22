import { useMemo, useState } from 'react';
import type { MenuConfig, Product } from '../../types';
import { buildMenuSummary, encodeMenuSelection, type MenuSelectionState } from '../../utils/menuSelection';

interface MenuConfiguratorModalProps {
  product: Product;
  menuConfig: MenuConfig;
  products: Product[];
  onClose: () => void;
  onConfirm: (payload: { notes: string; displayNotes: string; modifierSummary: string }) => void;
}

export function MenuConfiguratorModal({
  product,
  menuConfig,
  products,
  onClose,
  onConfirm,
}: MenuConfiguratorModalProps) {
  const [firstId, setFirstId] = useState<number | null>(null);
  const [secondId, setSecondId] = useState<number | null>(null);

  const firstOptions = useMemo(
    () => products.filter((candidate) => candidate.isAvailable && candidate.productType === 'NORMAL' && candidate.menuCourseTags.includes('FIRST')),
    [products]
  );
  const secondOptions = useMemo(
    () => products.filter((candidate) => candidate.isAvailable && candidate.productType === 'NORMAL' && candidate.menuCourseTags.includes('SECOND')),
    [products]
  );

  const firstProduct = firstOptions.find((candidate) => candidate.id === firstId) ?? null;
  const secondProduct = secondOptions.find((candidate) => candidate.id === secondId) ?? null;

  const isValid =
    (!menuConfig.includeFirst || !!firstProduct) &&
    (!menuConfig.includeSecond || !!secondProduct);

  const handleConfirm = () => {
    if (!isValid) return;

    const selection: MenuSelectionState = {
      type: 'MENU_SELECTION',
      includeFirst: menuConfig.includeFirst,
      includeSecond: menuConfig.includeSecond,
      finalMode: menuConfig.finalMode,
      courses: {
        ...(firstProduct ? { FIRST: { productId: firstProduct.id, name: firstProduct.name, sent: false } } : {}),
        ...(secondProduct ? { SECOND: { productId: secondProduct.id, name: secondProduct.name, sent: false } } : {}),
      },
    };

    const displayNotes = buildMenuSummary(selection);
    onConfirm({
      notes: encodeMenuSelection(selection),
      displayNotes,
      modifierSummary: displayNotes,
    });
  };

  const renderOptions = (
    label: string,
    options: Product[],
    selectedId: number | null,
    onSelect: (value: number) => void
  ) => (
    <section className="product-configurator-modal__group">
      <div className="product-configurator-modal__group-header">
        <div>
          <p className="product-configurator-modal__group-title">{label}</p>
          <p className="product-configurator-modal__group-hint">Elige una opción</p>
        </div>
      </div>
      <div className="product-configurator-modal__options">
        {options.map((option) => (
          <label
            key={option.id}
            className={`product-configurator-modal__option ${selectedId === option.id ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name={`menu-option-${label}`}
              checked={selectedId === option.id}
              onChange={() => onSelect(option.id)}
            />
            <span>{option.name}</span>
          </label>
        ))}
      </div>
    </section>
  );

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-configurator-title"
    >
      <div className="modal product-configurator-modal">
        <h3 id="menu-configurator-title" className="modal__title">
          Configurar {product.name}
        </h3>

        <div className="product-configurator-modal__groups">
          {menuConfig.includeFirst && renderOptions('Primero', firstOptions, firstId, setFirstId)}
          {menuConfig.includeSecond && renderOptions('Segundo', secondOptions, secondId, setSecondId)}
        </div>

        <div className="product-configurator-modal__footer">
          <div className="product-configurator-modal__total">
            {Number(product.price).toFixed(2)} €
          </div>
          <div className="modal__actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={!isValid} style={{ flex: 2 }}>
              Añadir menú
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
