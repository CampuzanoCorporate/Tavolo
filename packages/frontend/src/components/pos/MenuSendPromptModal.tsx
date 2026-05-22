import type { CartItem, MenuCourseTag } from '../../types';
import { decodeMenuSelection } from '../../utils/menuSelection';

interface MenuSendPromptModalProps {
  items: CartItem[];
  onClose: () => void;
  onRequestCourse: (item: CartItem, course: MenuCourseTag) => void;
}

export function MenuSendPromptModal({
  items,
  onClose,
  onRequestCourse,
}: MenuSendPromptModalProps) {
  const menuItems = items
    .map((item) => ({ item, selection: decodeMenuSelection(item.notes) }))
    .filter((entry): entry is { item: CartItem; selection: NonNullable<ReturnType<typeof decodeMenuSelection>> } => !!entry.selection);

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-send-prompt-title"
    >
      <div className="modal menu-send-prompt-modal">
        <h3 id="menu-send-prompt-title" className="modal__title">Marchar platos del menú</h3>
        <div className="menu-send-prompt-modal__list">
          {menuItems.map(({ item, selection }) => (
            <div key={item.cartKey} className="menu-send-prompt-modal__item">
              <div className="menu-send-prompt-modal__item-header">
                <strong>{item.name}</strong>
                <span>{item.quantity} uds.</span>
              </div>
              <div className="menu-send-prompt-modal__actions">
                {selection.includeFirst && selection.courses.FIRST && !selection.courses.FIRST.sent && (
                  <button className="btn btn-secondary" onClick={() => onRequestCourse(item, 'FIRST')}>
                    Pedir primero
                  </button>
                )}
                {selection.includeSecond && selection.courses.SECOND && !selection.courses.SECOND.sent && (
                  <button className="btn btn-secondary" onClick={() => onRequestCourse(item, 'SECOND')}>
                    Pedir segundo
                  </button>
                )}
                {selection.finalMode === 'DESSERT_ONLY' && !selection.courses.DESSERT?.sent && (
                  <button className="btn btn-secondary" onClick={() => onRequestCourse(item, 'DESSERT')}>
                    {selection.courses.DESSERT?.productId ? 'Pedir postre' : 'Elegir postre'}
                  </button>
                )}
                {selection.finalMode === 'DESSERT_OR_COFFEE' && !selection.courses.DESSERT?.sent && !selection.courses.COFFEE?.sent && (
                  <button className="btn btn-secondary" onClick={() => onRequestCourse(item, 'DESSERT')}>
                    {selection.courses.DESSERT?.productId || selection.courses.COFFEE?.productId ? 'Pedir postre/café' : 'Elegir postre o café'}
                  </button>
                )}
                {selection.finalMode === 'DESSERT_AND_COFFEE' && !selection.courses.DESSERT?.sent && (
                  <button className="btn btn-secondary" onClick={() => onRequestCourse(item, 'DESSERT')}>
                    {selection.courses.DESSERT?.productId ? 'Pedir postre' : 'Elegir postre'}
                  </button>
                )}
                {selection.finalMode === 'DESSERT_AND_COFFEE' && !selection.courses.COFFEE?.sent && (
                  <button className="btn btn-secondary" onClick={() => onRequestCourse(item, 'COFFEE')}>
                    {selection.courses.COFFEE?.productId ? 'Pedir café' : 'Elegir café'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn-primary btn-full" onClick={onClose}>
            Seguir
          </button>
        </div>
      </div>
    </div>
  );
}
