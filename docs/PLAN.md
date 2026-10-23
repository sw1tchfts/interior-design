# Interior Design App: Implementation Plan

Personal tool for a working interior designer. Draw or scan a room, rebuild its furniture from photos, rearrange it in 3D, then render the redesign from the original photo angles.

## Decisions so far

- Web app first (native iOS capture app possibly later for LiDAR).
- Personal use: single account, but reliable enough for professional work.
- Any room shape (L-shapes, angled walls, sloped ceilings; multi-room as a stretch).
- Furniture: parametric, slightly cartoonish models with correct real-world proportions.
- Backend: Supabase (database, storage, auth, edge functions) and Vercel (hosting).
- Store imports and AI image generation are deferred.

## 1. Architecture

| Concern | Choice | Why |
|---|---|---|
| Framework | Vite + React 19 + TypeScript (strict), single-page app | Canvas-heavy editor, no SEO or server rendering value. Next.js adds client/SSR boilerplate around every 3D component for nothing. Vercel hosts a Vite SPA natively. |
| 3D | three.js + @react-three/fiber + drei, postprocessing (ambient occlusion, outline) | Declarative scene that maps cleanly to app state. Render on demand to save battery. |
| 2D plan | Custom SVG with pan/zoom | Crisp lines and dimension labels, easy handles, printable plans later. |
| State | Zustand + immer: a persisted, undoable `documentStore` and a separate `uiStore` | Per-item selectors keep drag re-renders local. |
| Undo/redo | Custom snapshot history with transactions (begin, update, commit, cancel) | A whole drag is one undo step. Small and fully testable. |
| Schemas | Zod for the project document, furniture params and the Claude output schema | One source of truth, validation and migrations on load. |
| UI | Tailwind v4 + shadcn/ui (Radix) + lucide icons | Fast, accessible, professional panels. |
| Persistence (M1) | IndexedDB autosave + JSON export/import, behind a `ProjectRepository` interface | Keeps M1 local and fast; the data model is already cloud-ready. |
| Backend (M3+) | Supabase Postgres with row-level security, private Storage, Auth (sign-ups disabled), Edge Functions | |
| Anthropic API key | Supabase Edge Function secret, never a `VITE_*` variable (those ship to the browser) | |
| Long Claude calls | Job pattern: client inserts a pending `photo_analyses` row, the function processes in the background and updates the row | Survives navigation and function time limits. |

## 2. Conventions and data model

### Units and coordinates

- Store everything in meters (float64). 1 three.js unit = 1 m. Apple RoomPlan also uses meters, Y-up.
- Display is toggleable: imperial (default, precision 1" down to 1/16") or metric.
- Inputs accept any unit: `12'6"`, `12' 6 1/2"`, `12ft 6in`, `150.5"`, `320cm`, `3.2m`, or a bare number in the default unit.
- World is Y-up with the floor at y = 0. Plan coordinates (x, y) map to world (x, z).
- The room polygon is the interior wall faces (what designers measure). Wall thickness extrudes outward.
- Furniture local frame: origin at footprint center on the floor, front faces +z. Wall snapping aligns the back.

### Project document (one versioned JSON document per project)

```ts
type Id = string;
type Vec2 = [number, number]; // meters, plan (x, z)

interface ProjectDoc {
  schemaVersion: 1;
  id: Id; name: string; clientName?: string; address?: string; notes?: string;
  settings: { unitSystem: 'imperial' | 'metric'; precision: '1' | '1/2' | '1/4' | '1/8' | '1/16' | 'cm' | 'mm';
              snapStep: number; rotationSnapDeg: number; wallSnap: boolean };
  rooms: Record<Id, Room>; roomOrder: Id[];
  layouts: Record<Id, Layout>;               // each belongs to a room
  photoCameras: Record<Id, PhotoCalibration>; // keyed by photoId (M5)
}

interface Room {
  id: Id; name: string;
  origin: { x: number; z: number; rotation: number }; // multi-room later
  vertices: { id: Id; p: Vec2 }[];                     // closed loop, interior faces
  walls: { id: Id; from: Id; to: Id; thickness: number; heightOverride?: number; bulge?: number }[];
  ceiling: { height: number; slopes: CeilingSlope[] };
  openings: Opening[];                                 // doors, windows (M2)
  fixtures: Fixture[];                                 // columns, beams, built-ins (M2+)
  materials: { floor: string; walls: string; ceiling: string };
}

interface Layout {
  id: Id; roomId: Id; name: string; kind: 'as_is' | 'proposal';
  items: Record<Id, Item>; itemOrder: Id[];
}

interface Item {
  id: Id; kind: FurnitureKind; name: string;
  dims: { width: number; depth: number; height: number };
  params: Record<string, number | string | boolean>; // validated per kind
  transform: { x: number; z: number; y: number; rotationY: number };
  colors: Partial<Record<MaterialSlot, string>>;
  originItemId?: Id; // links a proposal item to its as-is original (for before/after diffs)
  source: { type: 'manual' } | { type: 'photo'; photoId: Id; detectionId: Id } | { type: 'glb'; assetId: Id };
  locked?: boolean; hidden?: boolean; vendor?: string; url?: string; price?: number; notes?: string;
}
```

"As-is" and "Proposal" layouts exist from day one, because AI rendering later needs to know what moved, what was removed and what is new.

### Supabase tables (M3+)

| Table | Purpose |
|---|---|
| `projects` | `doc jsonb`, `doc_version` for optimistic concurrency (two tabs can't silently overwrite each other) |
| `project_snapshots` | Restorable history (daily, manual, before import) |
| `photos` | Original, analysis copy (max 2576 px long edge), thumbnail, EXIF |
| `photo_analyses` | Claude job status, result, token usage |
| `renders` (M7) | Render outputs per photo and layout |
| `assets` (M4) | Imported GLB models |

Saves go through a `save_project(id, doc, expected_version)` RPC and are always written to IndexedDB first.

## 3. Room editor

### Creating a room

1. **Quick shapes:** rectangle or L-shape with typed dimensions.
2. **Draw tool:** click to place corners, with live length and angle readout. Snaps to grid, 45/90 degree angles and existing corners. Type a length while drawing (`12'6` then Enter) to place the next corner exactly.
3. **Measurement table (M2):** wall length + turn angle per row, matching how designers tape-measure. The last wall is computed and the closure error is shown.

### Editing

- Drag corners; drag a wall parallel to itself (neighbors stretch, angles preserved).
- Click a wall's dimension label to type a new length; the adjacent wall slides so all angles stay fixed.
- Split and delete corners, set wall thickness, ceiling height, materials.

### 3D

- Floor from the polygon; walls as mitered prisms (M1).
- M2: per-wall builder with door and window cut-outs and sloped ceilings.
- "Dollhouse" cutaway: walls facing the camera fade out so you can see inside.

### Future LiDAR import

Apple RoomPlan's JSON export maps directly into this model (walls, doors, windows, and furniture boxes into the As-is layout). RoomPlan's USDZ is hard to read in the browser, so this likely needs a small iOS capture app, which could also record the exact camera position for every photo and skip manual calibration entirely.

## 4. Furniture system

Each furniture type is a pure TypeScript definition that produces:

- `parts()`: rounded boxes, cylinders, capsules and lathe shapes that exactly fill width x depth x height (the soft bevel gives the slightly cartoonish look);
- `footprint()`: for snapping and collisions;
- `planSymbol()`: the 2D plan drawing (arms, cushions, pillows);
- `keypoints()`: reference points used later to fit the model to photos.

### Initial library (M1)

| Type | Main params |
|---|---|
| Sofa / armchair | seats, seat height and depth, arm style (track, rolled), leg style, cushion counts |
| Chair | seat height, back style, arms |
| Table (coffee, side, dining, console, desk presets) | shape (rect, round, oval), base type, top thickness |
| Bed | size preset (twin to cal king), headboard, footboard, frame |
| Cabinet (dresser, nightstand, sideboard, media, bookcase) | drawer/door grid, plinth or legs |
| Rug | rect, round or runner; never collides |
| Generic box | label |

Later (M4): sectional, ottoman, lamps, plants, wall art, mirror, TV, curtains, GLB import.

### Interaction

- Plan and 3D views side by side, both editing the same data live.
- Drag in either view (3D drags on the floor plane). A whole drag is one undo step.
- Snapping: wall snap (back flush, rotates to the wall's angle), grid snap (default 1"), rotation snap (15 degrees, plus wall angles). Hold Alt to disable.
- Items stay inside the room; overlaps show a red warning but are allowed (chairs under tables).
- Keyboard: arrows nudge, R rotates 90 degrees, Cmd+D duplicates, Delete, Cmd+Z / Shift+Cmd+Z.

## 5. Photo pipeline (M5 and M6)

### Approach

- **Camera calibration is user-assisted:** you click a few room corners or baseboard lines in the photo, matched to the known 3D room. A small solver works out the camera's position, direction and focal length in milliseconds, and shows the room wireframe over the photo so you can see that it lines up. Expect about a minute per photo.
- **Claude vision handles meaning, not measurement:** it names each object, its style and colors, and gives approximate corner points in the photo. All real sizes are computed by the solver from the calibrated camera, and every result can be corrected by dragging.
- **Monocular depth models are deferred:** about 10-20% scale error indoors and heavier to host; they don't beat the assisted approach for a professional.

### Steps

1. Upload: read EXIF (focal length helps the solver), create an analysis copy and thumbnail, handle HEIC.
2. Photo tips in the app: 1x lens (not ultra-wide), standing height, from a corner, floor-wall lines visible.
3. Calibrate: click corners or two points along any baseboard or wall corner (works even when furniture hides the corners). Live residuals flag a bad click.
4. Fit objects (M5, manual): pick a type, drag its footprint and height points onto the photo, and the solver fits position, rotation and W x D x H. Lock any dimension you already know. Wall-mounted items (art, TV, windows) are measured exactly from the wall plane.
5. Claude detection (M6): pre-fills step 4 with proposals you accept, reject or correct. Estimated cost $0.10-0.20 per photo.
6. Accuracy check: a small set of your real photos with tape-measured furniture, used to measure and tune error.

## 6. Camera-matched rendering (M7) and image generation (M8)

- Rebuild the exact photo camera in 3D and render the new layout from that viewpoint.
- Useful right away without AI: before/after swipe compare, and new furniture composited onto the real photo.
- For AI generation later, each photo + layout produces a render package: stylized render, depth map, normals, line art, segmentation, masks for removed/moved/added items, crops of real pieces to preserve, and a text description of the changes. Any image model can sit behind a single `generate(package)` interface.

## 7. Milestones

**M1: Local room + furniture sandbox**
Project list with autosave and JSON export/import. Plan editor (quick shapes, draw tool with typed lengths, corner drag, editable wall lengths, dimension labels). 3D room with cutaway and camera presets. Seven furniture types, library and properties panels, drag and rotate in both views with grid/wall/rotation snapping, undo/redo, imperial/metric toggle.
*Demo:* draw an L-shaped room by typing lengths, add a sofa, two armchairs, a coffee table and a rug, arrange them, undo/redo, reload and see everything saved.

**M2: Room fidelity.** Doors, windows and openings; wall thickness and heights; sloped ceilings; columns and fixtures; measurement-table entry; door-swing clearance warnings.

**M3: Cloud + deploy.** Supabase sync, login, snapshots and restore, Vercel deploy. Multiple layouts per room (As-is, Option A, Option B) with compare. Plan export to PNG/SVG/PDF.

**M4: Library v2.** More furniture types, wall-mounted items, multi-select, resize handles, alignment guides, item metadata (vendor, price), GLB import.

**M5: Photos + calibration + manual fit.** First time 3D objects come from photos.

**M6: Claude detection.** Automatic proposals from photos.

**M7: Camera-matched renders.** Render from the photo angle, before/after compare, render package export.

**M8: AI image generation.**

**Later:** RoomPlan import, iOS capture app, multi-room floors, store imports, client presentation PDFs.

## 8. Risks

1. Calibration effort or accuracy: line clicks, EXIF focal prior, live overlay, photo tips; ultra-wide lenses are not supported.
2. Claude's point estimates are approximate: it only proposes, the solver measures, and everything is editable.
3. Far objects at shallow angles are less accurate: use wall constraints, size priors and dimension locks.
4. Wall/ceiling geometry edge cases: property-based tests on random room shapes.
5. Supabase free tier pauses after about a week idle: consider Pro ($25/month); the local cache keeps working offline either way.
6. Data loss: local write-ahead, versioned saves, snapshots, JSON export.

## 9. Repository layout (M1) and testing

```
src/
  domain/       pure TypeScript, fully unit-tested
    units/      parse and format lengths
    geometry/   polygon math, collisions
    schema/     project document, defaults, migrations
    room/       room editing operations
    furniture/  furniture type definitions and registry
    snapping/   grid, angle, wall snapping, room constraint
  state/        document store, undo/redo history, UI store
  persistence/  IndexedDB repository, autosave, export/import
  plan2d/       SVG plan editor
  view3d/       3D scene, room shell, furniture meshes, drag controls
  ui/           panels, toolbar, inputs, pages
e2e/            Playwright smoke test
```

- **Vitest** for all domain math, including property tests (fast-check): length parsing round-trips, room edits keep angles, furniture fills its bounding box exactly, snapped items stay inside the room, a drag is one undo step.
- **Playwright** smoke test (preinstalled Chromium): create a room, add a sofa, drag it, undo, reload, confirm it was saved.
- `npm run check` runs typecheck, lint, unit tests and e2e.
