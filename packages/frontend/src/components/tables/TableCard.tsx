/**
 * TAVOLO POS — Componente Tarjeta de Mesa
 */
import type { Table } from '../../types';

interface TableCardProps {
  table: Table;
  onClick: () => void;
}

const STATUS_CONFIG: Record<
  Table['status'],
  { label: string; color: string }
> = {
  FREE:           { label: 'Libre', color: 'var(--color-free)' },
  OCCUPIED:       { label: 'Ocupada', color: 'var(--color-occupied)' },
  ORDERING:       { label: 'Pidiendo', color: 'var(--color-ordering)' },
  BILL_REQUESTED: { label: 'Cuenta', color: 'var(--color-bill)' },
};

export function TableCard({ table, onClick }: TableCardProps) {
  const config = STATUS_CONFIG[table.status];

  return (
    <button
      id={`table-card-${table.id}`}
      className="table-card"
      data-status={table.status}
      onClick={onClick}
      aria-label={`${table.name ?? `Mesa ${table.number}`}, estado: ${config.label}`}
    >
      {/* Número de mesa */}
      <span
        className="table-card__number"
        style={{ color: config.color }}
      >
        {table.number}
      </span>

      {/* Nombre de la mesa */}
      {table.name && (
        <span className="table-card__name">{table.name}</span>
      )}

      {/* Badge de estado */}
      <span
        className="table-card__status-badge"
        style={{
          backgroundColor: `${config.color}18`,
          color: config.color,
          border: `1px solid ${config.color}30`,
        }}
      >
        <span>{config.label}</span>
      </span>

      {/* Info de asientos */}
      <span className="table-card__seats">
        {table.seats} plazas
      </span>
    </button>
  );
}
