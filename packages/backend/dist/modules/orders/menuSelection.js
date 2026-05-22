"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeMenuSelection = encodeMenuSelection;
exports.decodeMenuSelection = decodeMenuSelection;
exports.buildMenuSummary = buildMenuSummary;
exports.getVisibleNotes = getVisibleNotes;
const MENU_NOTE_PREFIX = '__TAVOLO_MENU__';
function encodeMenuSelection(state) {
    return `${MENU_NOTE_PREFIX}${JSON.stringify(state)}`;
}
function decodeMenuSelection(notes) {
    if (!notes || !notes.startsWith(MENU_NOTE_PREFIX))
        return null;
    try {
        const parsed = JSON.parse(notes.slice(MENU_NOTE_PREFIX.length));
        if (parsed?.type !== 'MENU_SELECTION')
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function buildMenuSummary(selection) {
    return [
        selection.courses.FIRST?.name ? `Primero: ${selection.courses.FIRST.name}` : '',
        selection.courses.SECOND?.name ? `Segundo: ${selection.courses.SECOND.name}` : '',
        selection.courses.DESSERT?.name ? `Postre: ${selection.courses.DESSERT.name}` : '',
        selection.courses.COFFEE?.name ? `Cafe: ${selection.courses.COFFEE.name}` : '',
    ].filter(Boolean).join(' | ');
}
function getVisibleNotes(notes) {
    const selection = decodeMenuSelection(notes);
    if (!selection)
        return notes ?? undefined;
    return buildMenuSummary(selection) || 'Menu configurado';
}
//# sourceMappingURL=menuSelection.js.map