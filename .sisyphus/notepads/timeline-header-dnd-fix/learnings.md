# Timeline Header Drag & Drop Fix - Learnings

## Problem
The `timelineHeader.vue` component had drag & drop broken due to `manualDragStart` mode passing a `dragStart` function to the slot, which was called on `mousedown`. This was problematic because:
- `mousedown` fires a `MouseEvent` without `dataTransfer`
- The `dragStart` function expected a `DragEvent` with `dataTransfer` property
- This mismatch caused silent failures and broken drag functionality

## Solution Applied
Switched from the manual drag start pattern to native drag & drop:

1. **Removed `manualDragStart` property** from `<MkDraggable>` component (line 11)
2. **Removed `dragStart` from slot scope** destructuring (line 12)
3. **Removed `@mousedown="dragStart"` handler** from the drag handle button (line 14)

## Reference Pattern
The working implementation exists in `packages/frontend/src/pages/settings/navbar.vue` (lines 12-21):
- Uses `<MkDraggable>` without `manualDragStart`
- Slot scope only includes `{ item }`
- Button handles drag natively via `draggable="true"` implicit on MkDraggable container

## Key Learning
MkDraggable component provides native drag support when not using `manualDragStart` mode. The component correctly handles:
- Native `dragstart` events from the container
- `dataTransfer` object setup
- Drop zone handling

Using manual event handlers on `mousedown` is unnecessary and breaks the event flow.

## Verification
- LSP diagnostics: ✅ No errors on `timelineHeader.vue`
- TypeScript typecheck: ✅ No new errors introduced
- Changes are minimal and focused (3 line modifications only)
