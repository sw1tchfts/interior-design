import { memo, useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getKind, itemColor, itemParts, planShapes } from '../domain/furniture/registry';
import type { Item } from '../domain/schema/project';

interface Props {
  item: Item;
  px: number; // meters per screen pixel
  dimmed?: boolean;
  onPointerDown?(e: ReactPointerEvent, item: Item): void;
}

/** Architectural plan symbol generated from the item's parametric parts. */
export const ItemSymbol = memo(function ItemSymbol({ item, px, dimmed, onPointerDown }: Props) {
  const shapes = useMemo(() => planShapes(itemParts(item)), [item]);
  const { x, z, rotationY } = item.transform;
  const isRug = !getKind(item.kind).collides;
  return (
    <g
      data-item-id={item.id}
      transform={`translate(${x} ${z}) rotate(${(-rotationY * 180) / Math.PI})`}
      opacity={dimmed ? 0.35 : item.hidden ? 0.3 : 1}
      style={{ cursor: item.locked ? 'default' : 'move' }}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, item) : undefined}
    >
      <title>{item.name}</title>
      {shapes.map((s, i) => {
        const fill = itemColor(item, s.slot);
        const common = {
          fill,
          stroke: isRug ? 'rgba(0,0,0,0.25)' : 'rgba(30,28,25,0.75)',
          strokeWidth: px * (isRug ? 0.75 : 1),
        };
        return s.type === 'rect' ? (
          <rect key={i} x={s.x - s.w / 2} y={s.z - s.d / 2} width={s.w} height={s.d} rx={s.r} {...common} />
        ) : (
          <ellipse key={i} cx={s.x} cy={s.z} rx={s.rx} ry={s.rz} {...common} />
        );
      })}
    </g>
  );
});
