/**
 * TAVOLO POS — Sidebar de Categorías
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Category } from '../../types';

interface CategorySidebarProps {
  categories: Category[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  getCategoryAccent: (category: Category) => string;
}

const MAX_CATEGORY_SLOTS = 8;

export function CategorySidebar({ categories, selectedId, onSelect, getCategoryAccent }: CategorySidebarProps) {
  const [page, setPage] = useState(0);

  const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const hasPagination = sortedCategories.length > MAX_CATEGORY_SLOTS;
  const categoriesPerPage = hasPagination ? MAX_CATEGORY_SLOTS - 1 : MAX_CATEGORY_SLOTS;
  const totalPages = Math.max(1, Math.ceil(sortedCategories.length / categoriesPerPage));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleCategories = sortedCategories.slice(
    currentPage * categoriesPerPage,
    currentPage * categoriesPerPage + categoriesPerPage,
  );

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    if (selectedId === null) return;
    const selectedIndex = sortedCategories.findIndex((category) => category.id === selectedId);
    if (selectedIndex === -1) return;
    const nextPage = Math.floor(selectedIndex / categoriesPerPage);
    if (nextPage !== currentPage) {
      setPage(nextPage);
    }
  }, [categoriesPerPage, currentPage, selectedId, sortedCategories]);

  return (
    <nav className="category-sidebar" aria-label="Categorías de productos">
      <div className="category-sidebar__header">
        <span className="category-sidebar__eyebrow">Carta</span>
        <strong className="category-sidebar__title">Categorías</strong>
        <span className="category-sidebar__meta">{categories.length} familias</span>
      </div>

      {visibleCategories.map((cat) => (
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

      {hasPagination && (
        <button
          type="button"
          className="category-btn category-btn--pager"
          onClick={() => setPage((current) => (current + 1) % totalPages)}
        >
          <span className="category-btn__label">
            Más categorías
          </span>
          <span className="category-btn__count">
            {currentPage + 1}/{totalPages}
          </span>
        </button>
      )}
    </nav>
  );
}
