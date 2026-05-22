const MENU_NOTE_PREFIX = '__TAVOLO_MENU__';

export type MenuCourseTag = 'FIRST' | 'SECOND' | 'DESSERT' | 'COFFEE';
export type MenuFinalMode = 'DESSERT_ONLY' | 'DESSERT_OR_COFFEE' | 'DESSERT_AND_COFFEE';

export interface MenuCourseSelection {
  productId?: number;
  name?: string;
  sent?: boolean;
}

export interface MenuSelectionState {
  type: 'MENU_SELECTION';
  includeFirst: boolean;
  includeSecond: boolean;
  finalMode: MenuFinalMode;
  courses: Partial<Record<MenuCourseTag, MenuCourseSelection>>;
}

export function encodeMenuSelection(state: MenuSelectionState) {
  return `${MENU_NOTE_PREFIX}${JSON.stringify(state)}`;
}

export function decodeMenuSelection(notes?: string | null): MenuSelectionState | null {
  if (!notes || !notes.startsWith(MENU_NOTE_PREFIX)) return null;

  try {
    const parsed = JSON.parse(notes.slice(MENU_NOTE_PREFIX.length)) as MenuSelectionState;
    if (parsed?.type !== 'MENU_SELECTION') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildMenuSummary(selection: MenuSelectionState) {
  return [
    selection.courses.FIRST?.name ? `Primero: ${selection.courses.FIRST.name}` : '',
    selection.courses.SECOND?.name ? `Segundo: ${selection.courses.SECOND.name}` : '',
    selection.courses.DESSERT?.name ? `Postre: ${selection.courses.DESSERT.name}` : '',
    selection.courses.COFFEE?.name ? `Cafe: ${selection.courses.COFFEE.name}` : '',
  ].filter(Boolean).join(' | ');
}

export function getVisibleNotes(notes?: string | null) {
  const selection = decodeMenuSelection(notes);
  if (!selection) return notes ?? undefined;
  return buildMenuSummary(selection) || 'Menu configurado';
}
