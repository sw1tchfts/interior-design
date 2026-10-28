# Conventions

- **Units:** every length is stored in meters (float). Format for display with `formatLength`, parse user input with `parseLength`; never store display units.
- **Coordinates:** world is Y-up with the floor at y = 0; 1 three.js unit = 1 m. Plan coordinates `[x, z]` map directly to world x/z (SVG y = world z).
- **Rotation:** `transform.rotationY` matches three.js `rotation.y`. Use `localToWorld` / `worldToLocal` from `domain/geometry/vec2.ts`; in SVG, rotate by `-rotationY` degrees.
- **Rooms:** `vertices` are the interior wall faces, counter-clockwise in (x, z) math orientation (positive signed area). Wall `i` runs from vertex `i` to `i + 1`; `walls` is parallel to `vertices`. Room edits go through pure functions in `domain/room/roomOps.ts`, then `validateRoomPoints`.
- **Openings:** doors and windows hang on a wall by `wallId`; `offset` runs from the wall's start vertex (the left end, seen from inside the room) to the near edge. Wall edits don't rewrite offsets, so always read positions through `openingSpan` in `domain/room/openings.ts`.
- **Furniture:** origin at the footprint center on the floor, front facing local +z. A kind's `parts()` must exactly fill width x height x depth (enforced by `kinds.test.ts`).
- **State:** change the document only through `documentStore` actions so undo/redo and autosave work. Wrap continuous edits (drags, typing) in `begin()` / `end()` to make them one undo step.
- **Schema changes:** bump `CURRENT_SCHEMA_VERSION` and add a migration in `parseProjectDoc`.
- Keep `src/domain` free of React and DOM code so it stays unit-testable.
- Run `npm run check` before pushing.
