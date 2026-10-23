import { describe, expect, it } from 'vitest';
import { createProject, parseProjectDoc } from './project';
import { rectangleRoomPoints } from '../room/roomOps';

describe('project document', () => {
  it('creates a valid project that survives a JSON round trip', () => {
    const doc = createProject('Smith Living Room', rectangleRoomPoints(4, 3));
    const restored = parseProjectDoc(JSON.parse(JSON.stringify(doc)));
    expect(restored).toEqual(doc);
    const room = restored.rooms[restored.roomOrder[0]!]!;
    expect(room.walls).toHaveLength(room.vertices.length);
  });

  it('rejects invalid or newer documents', () => {
    expect(() => parseProjectDoc({ foo: 1 })).toThrow();
    const doc = createProject('x', rectangleRoomPoints(4, 3));
    expect(() => parseProjectDoc({ ...doc, schemaVersion: 99 })).toThrow(/newer version/);
  });
});
