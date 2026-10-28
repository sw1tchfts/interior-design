import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createProject, parseProjectDoc } from './project';
import { rectangleRoomPoints } from '../room/roomOps';

describe('project document', () => {
  it('creates a valid project that survives a JSON round trip', () => {
    const doc = createProject('Smith Living Room', rectangleRoomPoints(4, 3));
    const restored = parseProjectDoc(JSON.parse(JSON.stringify(doc)));
    expect(restored).toEqual(doc);
    const room = restored.rooms[restored.roomOrder[0]!]!;
    expect(room.walls).toHaveLength(room.vertices.length);
  });

  it('migrates version 1 openings', () => {
    const doc = createProject('x', rectangleRoomPoints(4, 3));
    const roomId = doc.roomOrder[0]!;
    const room = doc.rooms[roomId]!;
    const v1 = {
      ...doc,
      schemaVersion: 1,
      rooms: {
        [roomId]: {
          ...room,
          openings: [{ id: 'o1', wallId: room.walls[0]!.id, type: 'cased', offset: 1, width: 0.9, height: 2, sill: 0 }],
        },
      },
    };
    const migrated = parseProjectDoc(JSON.parse(JSON.stringify(v1)));
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.rooms[roomId]!.openings[0]).toMatchObject({ type: 'opening', hinge: 'start', swing: 'in', offset: 1 });
    expect(parseProjectDoc({ ...doc, schemaVersion: 1 }).rooms[roomId]!.openings).toEqual([]);
  });

  it('rejects invalid or newer documents', () => {
    expect(() => parseProjectDoc({ foo: 1 })).toThrow();
    const doc = createProject('x', rectangleRoomPoints(4, 3));
    expect(() => parseProjectDoc({ ...doc, schemaVersion: 99 })).toThrow(/newer version/);
  });
});
