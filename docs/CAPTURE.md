# Capture and Import: Photos and LiDAR

How a real room and its furniture get from a site visit into the app. LiDAR first, using an existing scanner app; photos from the regular camera for style; photo-only capture as the fallback. This replaces the order of M5/M6 in [PLAN.md](PLAN.md).

Priorities: the furniture matters most. Walls, doors and windows only need to be good enough to see and to place furniture against.

## 1. The idea

Scan the room with a free app built on Apple's RoomPlan and export the file. "Import scan" turns it into the room outline, doors and windows, and a measured box for each big piece of furniture with its category (sofa, chair, table, bed, storage...), which becomes parametric furniture of the right kind at the right size. Photos taken with the normal camera supply the style: Claude describes each piece from a photo crop (arms, legs, cushions, colors) without having to measure anything. For overlays and camera-matched renders, a photo can be aligned to the scanned room with a few clicks. If that gets tedious, a small capture app of our own can record photo positions automatically later (section 9).

## 2. What each source gives us

| Source | Room | Furniture | Photos |
|---|---|---|---|
| Existing RoomPlan app (LiDAR iPhone/iPad) | Walls, ceiling height, doors, windows, openings | Box (W x D x H) + position + category for big pieces | None |
| Photos from any camera | — | Style, color, small items RoomPlan skips | Camera position only after click alignment |
| Manual entry (today's editor) | Draw or type walls | Library + properties panel | — |
| Own capture app (later, optional) | Same as above | Same as above | Exact camera position for every photo, automatically |

RoomPlan does not detect rugs, lamps, art, plants, curtains or most decor. Those come from photos (Claude proposals) or the library.

## 3. Constraints

- **No LiDAR in the browser.** Safari on iPhone can't reach LiDAR or ARKit, so scanning happens in a native app; we only import its file.
- **RoomPlan needs a LiDAR device:** iPhone 12 Pro or later Pro models, or iPad Pro (2020 or later).
- **Export contents vary by app and format.** Whether furniture comes out as separate, named pieces, which way is up, and whether the units are meters all need checking against real files.
- **USDZ is hard to read in the browser.** three.js's docs say its loader only reads USDZ with text USD (USDA), though a pending pull request adds binary support. RoomPlan's USDZ is most likely binary (USDC), which today needs a WASM or third-party parser. GLB and OBJ load with three.js as-is.

## 4. Scanning with an existing app

| App | Cost (checked Oct 2026) | Exports | Notes |
|---|---|---|---|
| **OpenPlan3D** (Laan Labs) | Free, no paywall | Editable Plan JSON, USDZ, PNG, SVG, DXF, PDF | First choice. RoomPlan-based. Its JSON export is a documented extension of Apple's RoomPlan JSON (`docs/handoff-format-v1.md` in the MIT-licensed `laanlabs/openPlan3D` repo): meters, 4x4 transforms, walls with thickness, doors with hinge and swing, windows with sill height, furniture with size and position. New app (few ratings); furniture category names still to confirm from a real export. |
| **Polycam** | Free plan exports glTF only | glTF (free); more on paid plans | Space Mode detects furniture on every plan. Unknown whether furniture comes out as separate, named pieces. Backup. |
| 3D Scanner App | Subscription ($2.99-4.99/week or $29.99-69.99/year) | GLB, OBJ, USDZ and more | Reviews say basic features moved behind the subscription. Not worth paying for. |
| Room(Scan) | Export is Pro-only ($1.99/week, $4.99/month, $49.99 lifetime) | USDZ | Skip. |

Preferred format, best first: RoomPlan-style JSON (plain data, nothing to parse but JSON), GLB (three.js reads it natively, node names survive), OBJ (groups carry names), USDZ (needs a binary USD parser).

Sample data without scanning: the `laanlabs/openPlan3D` repo also has `test-roomplan.json` (247 KB, MIT), which appears to be raw Apple `CapturedRoom` JSON output.

### What the sample files must tell us

1. Is each piece of furniture a separate node or mesh, and does its name give the category ("Sofa0", "Storage2")?
2. Are walls, doors and windows separate pieces? Do walls have thickness, and which side is the room?
3. Units and axes: meters, Y up?
4. Is the box an exact bounding box of the measured piece, or a styled model?
5. Accuracy against a tape measure, and what RoomPlan misses or merges (sectionals, ottomans, side tables).

### Findings from openPlan3D's `test-roomplan.json`

Raw Apple `CapturedRoom` JSON (`version: 2`) of a small apartment: 20 walls, 4 doors, 4 windows, 13 objects, 4 `sections` (bedroom, bedroom, bathroom, unidentified).

- **Units and axes:** meters, Y up. Transforms are column-major 4x4 (translation at indices 12-14). The origin is wherever the phone started, so the floor sits at y = -1.49 here; import must shift it to 0.
- **Furniture faces local +z, like ours.** In 12 of 13 objects the -z face is within 8 cm of a wall (backs against walls); the desk chair's +z face points at the desk. So `rotationY = atan2(t[8], t[10])` copies straight across.
- **Object `dimensions` = [width, height, depth].** Objects can float: a counter sink's bottom is 0.77 m up, so `transform.y` matters.
- **Attributes exist:** `ChairType` (swivel), `ChairArmType`, `ChairBackType`, `ChairLegType` (star), `StorageType` (cabinet / shelf), `TableShapeType` (rectangular), `TableType`, `SofaType` (rectangular). They map onto our style params.
- **Walls are segments with zero thickness** (`dimensions` = [length, height, 0]); 37 of 40 wall ends meet another wall exactly, so rooms can be rebuilt as closed loops from the wall graph. The single `floors` entry is only a bounding rectangle for multi-room scans.
- **Doors and windows** point at their wall through `parentIdentifier`; doors carry `isOpen`. Window sills here are 1.21-1.29 m above the floor. Ceiling 2.44 m.
- **Multi-room scans happen.** The editor works on one room at a time, so import should let you pick a room (by `sections` label) until multi-room editing exists.
- `coreModel` (an opaque Apple blob) is 86% of the file and can be ignored.

## 5. Import into the web app

"Import scan" next to "Import project file". It creates a new project, or adds the room to the current one.

### Structure

One small adapter per app and format reads the file into a neutral `ScanData` (walls, openings, objects with category, size and transform). The mapping from `ScanData` to our document is shared, so supporting another app later means writing only an adapter. The original file is kept with the project so a scan can be re-imported when the mapping improves.

### Coordinates

RoomPlan uses meters, Y up, right-handed, like us, but with an arbitrary origin and heading (wherever the scan started). On import we apply one rigid transform to everything: rotate about Y so the longest wall runs along +x, and translate so the room's bounding box starts at the origin.

### Room

- Outline from the floor (if exported) or from wall pieces intersected pairwise. Then `normalizeWinding` and `validateRoomPoints`.
- Walls: use the room-side face as the outline; keep our default thickness unless the file gives one.
- Ceiling height: median wall height.
- Doors, windows, openings: snap each to the nearest wall, then `offset` = distance from the wall's start to the near edge, plus `width`, `height` and `sill`. Hinge and swing aren't captured; defaults are fine.

### Furniture

Each scanned object becomes an Item in the As-is layout, with `source: { type: 'scan', scanId, objectId }`.

| RoomPlan category | Our kind and preset | Rules |
|---|---|---|
| sofa | sofa | seats from width (about 30" per seat); armchair if under 45" wide |
| chair | chair | dining chair, stool or armchair from size |
| table | table | coffee if under 22" tall, dining if 28-31" and deep, console if shallow; round if the footprint is square and the name or file says so |
| bed | bed | size preset nearest the measured width |
| storage | cabinet | bookcase if tall and shallow; else dresser, sideboard, nightstand or media by size |
| television, fireplace | box, labeled (proper kinds in M4) | |
| refrigerator, stove, oven, dishwasher, sink, washer/dryer, toilet, bathtub, stairs | box, labeled, locked | fixed things the layout works around |

- Size: the box's width, height and depth, copied exactly. Style params start at the kind's defaults.
- Position: box center on the floor. Rotation from the box's horizontal axis, snapped to the nearest wall angle when within a few degrees.
- Facing: a box can't tell front from back. Seating, beds and storage within a few inches of a wall face away from it; free-standing pieces get a best guess and a "check facing" badge (R twice flips them), or the style pass decides from photos.

### Schema changes

- `Item.source` gains `{ type: 'scan'; scanId; objectId }` and `{ type: 'photo'; photoId; detectionId }`.
- `scans` records holding the original file; `photos` records (image blobs stored outside the document); `photoCameras` for aligned photos.
- Bump `CURRENT_SCHEMA_VERSION` with a migration, per CLAUDE.md.

## 6. Photos

- Uploaded in the web app, from a computer or straight from a phone's browser (which can open the camera). Stored locally in IndexedDB until the cloud milestone moves them to Supabase Storage. Each keeps the original, an analysis copy (max 2576 px long edge) and a thumbnail.
- **Linking photos to furniture**: the style pass needs a crop of each piece. First version: Claude is given the photo and the list of scanned pieces ("84" sofa, 36" round table...") and returns where each one appears; you confirm or drag the box. Fallback: drag the box yourself.
- **Alignment (optional, per photo)**: click a few room corners or floor-wall lines; a solver finds the camera (PLAN.md section 5). With a scanned room the geometry is exact, so a handful of clicks is enough. An aligned photo gets the 3D overlay, automatic crops for every piece, and later camera-matched renders.

## 7. Style pass: from boxes to real-looking furniture

For each scanned piece:

1. Gather its crops (from the linking step, or projected automatically in aligned photos).
2. Send the crops, the kind's parameter schema and the measured size to Claude. It returns style params (arm and leg style, cushion counts, back style, door/drawer grid...) and colors per material slot, validated with Zod.
3. Review side by side: photo crop next to our 3D model; accept or tweak in the properties panel.

Claude never measures here; LiDAR already did. It needs the Anthropic key on a server (a Supabase Edge Function per PLAN.md), so this step depends on the cloud backend.

Small items RoomPlan missed (lamps, rugs, art, plants): Claude proposes them from the photos; in an aligned photo, clicking a rug's corners or a frame's edges gives exact sizes.

## 8. Photo-only path (no scan)

For client-sent photos or rooms without a LiDAR scan: draw the room, upload photos, align each one by clicking corners, then fit furniture manually or from Claude proposals (PLAN.md section 5). After that, photos behave the same as with a scan.

## 9. Later, if needed: our own capture app

What it would add: the exact camera position and lens for every photo, recorded during the scan, so alignment clicks disappear and renders line up automatically. Build it only if alignment turns out to be the bottleneck.

How (no Mac available): an Expo (React Native) app with one small local Swift module for RoomPlan and ARKit, built in Expo's cloud with EAS. It would export a `.roomscan` zip: RoomPlan's own `CapturedRoom` JSON, the photos, and each photo's camera transform and intrinsics. Costs: Apple Developer Program ($99/year); EAS Free covers 15 iOS builds a month. Swift can't be compiled on Windows, so the native part stays thin. `expo-roomplan` on npm is a reference for wrapping RoomPlan. Open question for then: whether photo poses from a shared `ARSession` line up exactly with RoomPlan's coordinates.

## 10. Steps

| Step | What | Needs |
|---|---|---|
| **S0. Sample scans** | Scan one furnished room with OpenPlan3D (and Polycam's free plan as a backup); export the JSON and every other format offered; tape-measure 3-4 pieces. Inspect the files to answer section 4's questions. | LiDAR iPhone/iPad |
| **S1. Import scan** | Adapter for the best format; room, openings and furniture mapped to kinds; original file kept. *Done for RoomPlan JSON (`src/domain/scan/`), except keeping the original file; still to confirm on an OpenPlan3D export.* | S0 |
| **S2. Photos** | Upload and local storage, photo strip in the editor, linking pieces to photos (manual boxes first) | S1 |
| **S3. Style pass** | Crops to Claude to style params; review UI; Claude-located boxes | S2 + cloud backend (M3) |
| **S4. Alignment** | Click alignment, 3D overlay on photos, automatic crops | S2 |
| **Then** | Camera-matched renders (M7) for aligned photos; own capture app only if S4 is too slow | |

## 11. Decisions

Decided:

- Start with an existing scanner app; no app of our own for now.
- If we build one later: Expo + EAS, since there's no Mac.

Still open:

1. Which device will do the scanning? (LiDAR iPhone Pro or iPad Pro.)
2. Where do most furniture photos come from: your own site visits, or clients? This decides how soon the photo-only path is needed.

Sample scans go in `samples/` at the repo root. It's git-ignored, since scans and photos of real homes shouldn't be committed.
