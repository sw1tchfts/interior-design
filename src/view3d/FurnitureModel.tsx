import { memo, useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { getKind, itemColor, itemFootprint } from '../domain/furniture/registry';
import type { Item } from '../domain/schema/project';
import { partsToGeometries } from './partsToGeometry';

interface Props {
  item: Item;
  selected: boolean;
  colliding: boolean;
  onPointerDown(e: ThreeEvent<PointerEvent>, item: Item): void;
  onPointerMove(e: ThreeEvent<PointerEvent>): void;
  onPointerUp(e: ThreeEvent<PointerEvent>): void;
}

export const FurnitureModel = memo(function FurnitureModel({ item, selected, colliding, onPointerDown, onPointerMove, onPointerUp }: Props) {
  const { kind, dims, params } = item;
  const geometries = useMemo(() => partsToGeometries(getKind(kind).parts(dims, params)), [kind, dims, params]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const outline = useMemo(() => {
    if (!selected && !colliding) return null;
    const fp = itemFootprint(item);
    return [...fp, fp[0]!].map(([x, z]) => [x, 0.006, z] as [number, number, number]);
  }, [item, selected, colliding]);
  const isRug = !getKind(kind).collides;

  if (item.hidden) return null;
  return (
    <>
      <group
        position={[item.transform.x, item.transform.y, item.transform.z]}
        rotation-y={item.transform.rotationY}
        onPointerDown={(e) => onPointerDown(e, item)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        userData={{ itemId: item.id }}
      >
        {[...geometries].map(([slot, g]) => (
          <mesh key={slot} geometry={g} castShadow={!isRug} receiveShadow>
            <meshStandardMaterial
              color={itemColor(item, slot)}
              roughness={slot === 'metal' ? 0.35 : 0.8}
              metalness={slot === 'metal' ? 0.6 : 0}
              emissive={selected ? '#2f6fde' : '#000000'}
              emissiveIntensity={selected ? 0.12 : 0}
            />
          </mesh>
        ))}
      </group>
      {outline && <Line points={outline} color={colliding ? '#d1453b' : '#2f6fde'} lineWidth={2.5} />}
    </>
  );
});
