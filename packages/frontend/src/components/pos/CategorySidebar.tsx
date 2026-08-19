/**
 * TAVOLO POS — Sidebar de Categorías
 */
import type { CSSProperties } from 'react';
import type { Category } from '../../types';

interface CategorySidebarProps {
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  getCategoryAccent: (category: Category) => string;
}

export function CategorySidebar({ categories, selectedId, onSelect, getCategoryAccent }: CategorySidebarProps) {
  return (
    <nav className="category-sidebar" aria-label="Categorías de productos">
      <div className="category-sidebar__header">
        <span className="category-sidebar__eyebrow">Carta</span>
        <strong className="category-sidebar__title">Categorías</strong>
        <span className="category-sidebar__meta">{categories.length} familias</span>
      </div>

      {categories.map((cat) => (
        <button
          key={cat.id}
          id={`category-btn-${cat.id}`}
          className={`category-btn ${selectedId === cat.id ? 'active' : ''}`}
          onClick={() => onSelect(cat.id)}
          aria-pressed={selectedId === cat.id}
          style={{ ['--category-accent' as const]: getCategoryAccent(cat) } as CSSProperties}
        >
          {cat.icon && (
            <span className="category-btn__icon">{cat.icon}</span>
          )}

          <span className="category-btn__label">{cat.name}</span>

          {cat.color && (
            <span
              className="category-btn__color-dot"
              style={{ backgroundColor: cat.color }}
            />
          )}

          {cat.products && (
            <span className="category-btn__count">
              {cat.products.length}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
