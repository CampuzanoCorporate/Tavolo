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
      <div style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        color: 'var(--color-text-muted)',
        padding: '8px 4px 4px',
        marginBottom: 4,
      }}>
        Categorías
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

          <span style={{ flex: 1 }}>{cat.name}</span>

          {cat.color && (
            <span
              className="category-btn__color-dot"
              style={{ backgroundColor: cat.color }}
            />
          )}

          {cat.products && (
            <span style={{
              fontSize: '0.7rem',
              color: 'var(--color-text-muted)',
              minWidth: 20,
              textAlign: 'right',
            }}>
              {cat.products.length}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
