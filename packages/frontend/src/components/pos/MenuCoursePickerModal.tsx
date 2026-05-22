import { useMemo, useState } from 'react';
import type { MenuCourseTag, Product } from '../../types';

interface MenuCoursePickerModalProps {
  title: string;
  allowedTags: MenuCourseTag[];
  products: Product[];
  onClose: () => void;
  onConfirm: (product: Product) => void;
}

export function MenuCoursePickerModal({
  title,
  allowedTags,
  products,
  onClose,
  onConfirm,
}: MenuCoursePickerModalProps) {
  const options = useMemo(
    () => products.filter((candidate) => (
      candidate.isAvailable &&
      candidate.productType === 'NORMAL' &&
      allowedTags.some((tag) => candidate.menuCourseTags.includes(tag))
    )),
    [allowedTags, products]
  );
  const [selectedId, setSelectedId] = useState<number | null>(options[0]?.id ?? null);

  const selectedProduct = options.find((candidate) => candidate.id === selectedId) ?? null;

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-course-picker-title"
    >
      <div className="modal product-configurator-modal">
        <h3 id="menu-course-picker-title" className="modal__title">{title}</h3>
        <div className="product-configurator-modal__options">
          {options.map((option) => (
            <label
              key={option.id}
              className={`product-configurator-modal__option ${selectedId === option.id ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="menu-course-picker"
                checked={selectedId === option.id}
                onChange={() => setSelectedId(option.id)}
              />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!selectedProduct} onClick={() => selectedProduct && onConfirm(selectedProduct)} style={{ flex: 1.5 }}>
            Guardar y pedir
          </button>
        </div>
      </div>
    </div>
  );
}
