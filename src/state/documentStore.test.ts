import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../domain/schema/project';
import { rectangleRoomPoints } from '../domain/room/roomOps';
import { createItem, getKind } from '../domain/furniture/registry';
import { activeLayout, addItem, docActions, getDoc, updateItem } from './documentStore';

describe('document store', () => {
  beforeEach(() => docActions().load(createProject('Test', rectangleRoomPoints(4, 3))));

  it('records a drag as a single undo step', () => {
    const def = getKind('table');
    const item = createItem(def, def.presets[0]!, [1, 1]);
    addItem(item);
    docActions().begin();
    for (let i = 1; i <= 20; i++) updateItem(item.id, (it) => { it.transform.x = 1 + i / 100; });
    docActions().end();
    expect(activeLayout(getDoc()!).items[item.id]!.transform.x).toBeCloseTo(1.2);
    docActions().undo();
    expect(activeLayout(getDoc()!).items[item.id]!.transform.x).toBe(1);
    docActions().undo();
    expect(activeLayout(getDoc()!).items[item.id]).toBeUndefined();
    docActions().redo();
    docActions().redo();
    expect(activeLayout(getDoc()!).items[item.id]!.transform.x).toBeCloseTo(1.2);
  });
});
