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
export declare function encodeMenuSelection(state: MenuSelectionState): string;
export declare function decodeMenuSelection(notes?: string | null): MenuSelectionState | null;
export declare function buildMenuSummary(selection: MenuSelectionState): string;
export declare function getVisibleNotes(notes?: string | null): string | undefined;
//# sourceMappingURL=menuSelection.d.ts.map