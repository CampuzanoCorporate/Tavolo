/**
 * TAVOLO POS — Grid de Productos
 */
import type { CSSProperties } from 'react';
import type { Product } from '../../types';

interface ProductGridProps {
  products: Product[];
  accentColor: string;
  onProductClick: (product: Product) => void;
}

export function ProductGrid({ products, accentColor, onProductClick }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        gap: 'var(--space-3)',
        padding: 'var(--space-6)',
      }}>
        <p>Selecciona una categoría</p>
      </div>
    );
  }

  return (
    <div
      className="product-grid"
      role="list"
      aria-label="Productos disponibles"
      style={{ ['--product-family-color' as const]: accentColor } as CSSProperties}
    >
      {products.map((product) => (
        <button
          key={product.id}
          id={`product-card-${product.id}`}
          className="product-card"
          onClick={() => onProductClick(product)}
          role="listitem"
          aria-label={`${product.name}, ${Number(product.price).toFixed(2)} €`}
          disabled={!product.isAvailable}
        >
          <div className="product-card__add-icon">+</div>
          {product.productType === 'MENU' && (
            <span className="product-card__tag">Menu</span>
          )}
          <span className="product-card__name">{product.name}</span>
          {product.description && (
            <span style={{
              fontSize: '0.72rem',
              color: 'var(--color-text-muted)',
              lineHeight: 1.3,
            }}>
              {product.description.substring(0, 60)}
            </span>
          )}
          <span className="product-card__price">
            {Number(product.price).toFixed(2)} €
          </span>
        </button>
      ))}
    </div>
  );
}
