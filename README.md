# Room Planner

A personal tool for interior design: model a client's room, rebuild its furniture, and rearrange it in 2D and 3D. Later milestones add photo-based furniture capture, camera-matched renders and AI visualization (see [docs/PLAN.md](docs/PLAN.md)).

## What works today (milestone 1, plus doors and windows from milestone 2)

- **Projects** saved automatically in the browser (IndexedDB), with JSON export/import for backups.
- **Rooms of any shape**: start from a rectangle or L-shape, or draw an outline corner by corner. While drawing, type a length (`12'6`, `150"`, `320cm`) and press Enter to place the next corner exactly.
- **Wall editing**: click a wall's dimension to type a new length (corner angles are preserved), drag a wall to move it, drag corners, double-click a wall to add a corner.
- **Import a LiDAR scan**: scan a room with a free RoomPlan app such as OpenPlan3D (iPhone/iPad Pro), export its JSON, and use **Import scan** on the projects page. The room outline, doors, windows and furniture come in at their measured sizes, squared up, with each piece mapped to a furniture type (sofa, chair, table, bed, cabinet; appliances and fixtures as labeled, locked boxes). Multi-room scans let you pick a room. See [docs/CAPTURE.md](docs/CAPTURE.md).
- **Doors and windows**: hinged, double, sliding and pocket doors, cased openings and windows. Add them from the library (they go on the selected wall) or from a wall's properties, drag them along a wall or onto another one, and type exact distances to the corners. Doors can hinge left or right and swing in or out. The plan shows standard symbols with door swings; the 3D walls get real openings with trim, door leaves and glass.
- **Parametric furniture**: sofas/armchairs, chairs, tables, beds, cabinets/bookcases, rugs and generic boxes. Each piece is built from its real dimensions with adjustable style options and colors.
- **Arranging**: drag in the plan or in 3D, with grid snap, wall snap (backs flush against walls), rotation snap, a keep-inside-room constraint and overlap warnings. Undo/redo groups each drag into one step.
- **3D view** with a dollhouse cutaway (walls between you and the room hide automatically) and corner/top/eye-level camera presets.
- **Units**: feet and inches (to 1/16") or centimeters; any unit can be typed anywhere.

### Shortcuts

| Key | Action |
|---|---|
| Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z | Undo, redo |
| R / Shift+R | Rotate selection 90° |
| Arrows (Shift for 12x) | Nudge selection by the grid step |
| Ctrl/Cmd+D | Duplicate |
| Delete / Backspace | Delete selection (furniture, door or window) |
| D / V | Draw room tool / select tool |
| Alt (while dragging) | Ignore snapping |
| Shift (while rotating) | Free rotation |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck, lint, unit tests, build, end-to-end tests
```

- `npm test` runs the Vitest unit tests (domain math, furniture geometry, history).
- `npm run test:e2e` runs Playwright against a production build (uses the preinstalled Chromium).

The app is a static single-page app; deploy `dist/` to Vercel (see `vercel.json`).

## Code layout

```
src/domain/       pure TypeScript: units, geometry, project schema, room ops, furniture, snapping
src/domain/scan/  RoomPlan scan import: parse, find rooms, map furniture
src/state/        Zustand stores and undo/redo history
src/persistence/  IndexedDB repository, autosave, file export/import
src/plan2d/       SVG floor-plan editor
src/view3d/       react-three-fiber scene, wall and furniture geometry
src/ui/           pages, panels, inputs, shortcuts
```
