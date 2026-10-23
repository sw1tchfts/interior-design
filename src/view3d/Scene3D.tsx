import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { type PerspectiveCamera, Plane, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { boundingBox } from '../domain/geometry/polygon';
import type { Vec2 } from '../domain/geometry/vec2';
import type { Item, Room } from '../domain/schema/project';
import { roomPoints } from '../domain/room/roomOps';
import { dragItemTo, findCollisions } from '../domain/snapping/snapping';
import { activeLayout, activeRoom, docActions, getDoc, updateItem, useLayout, useRoom, useSettings } from '../state/documentStore';
import { type CameraPreset, ui, useUiStore } from '../state/uiStore';
import { FurnitureModel } from './FurnitureModel';
import { RoomShell } from './RoomShell';

function roomFrame(room: Room) {
  const { min, max } = boundingBox(roomPoints(room));
  const center = new Vector3((min[0] + max[0]) / 2, 0, (min[1] + max[1]) / 2);
  const span = Math.max(max[0] - min[0], max[1] - min[1], 2);
  return { center, span };
}

function presetPose(room: Room, preset: CameraPreset, camera: PerspectiveCamera) {
  const { center, span } = roomFrame(room);
  // Fit the room in whichever field of view (vertical or horizontal) is narrower.
  const vfov = (camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const dist = (span * 0.62) / Math.tan(Math.min(vfov, hfov) / 2);
  const target = center.clone().setY(preset === 'top' ? 0 : 0.5);
  switch (preset) {
    case 'top':
      return { position: center.clone().add(new Vector3(0, dist, 0.001)), target };
    case 'front':
      return { position: center.clone().add(new Vector3(0, 1.6, dist)), target: center.clone().setY(1.1) };
    default:
      return { position: target.clone().add(new Vector3(-0.55, 0.75, 0.75).normalize().multiplyScalar(dist)), target };
  }
}

/** Applies camera preset requests from the toolbar. */
function CameraRig({ room }: { room: Room }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const request = useUiStore((s) => s.cameraRequest);
  const initialized = useRef(false);
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => {
    if (!controls) return;
    if (initialized.current && !request) return;
    const pose = presetPose(roomRef.current, request?.preset ?? 'iso', camera as PerspectiveCamera);
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    controls.update();
    initialized.current = true;
    invalidate();
  }, [controls, camera, request, invalidate]);
  return null;
}

type Drag = { id: string; plane: Plane; offset: Vec2; pointerId: number };

function Furniture() {
  const layout = useLayout();
  const settings = useSettings();
  const selection = useUiStore((s) => s.selection);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const drag = useRef<Drag | null>(null);
  const items = useMemo(() => (layout ? layout.itemOrder.map((id) => layout.items[id]!).filter(Boolean) : []), [layout]);
  const collisions = useMemo(() => findCollisions(items), [items]);

  const onDown = useCallback(
    (e: ThreeEvent<PointerEvent>, item: Item) => {
      if (e.button !== 0 || ui().tool !== 'select') return;
      e.stopPropagation();
      ui().select({ type: 'item', id: item.id });
      if (item.locked) return;
      const plane = new Plane(new Vector3(0, 1, 0), -e.point.y);
      const hit = e.ray.intersectPlane(plane, new Vector3());
      if (!hit) return;
      drag.current = { id: item.id, plane, offset: [hit.x - item.transform.x, hit.z - item.transform.z], pointerId: e.pointerId };
      (e.target as unknown as Element).setPointerCapture(e.pointerId);
      if (controls) controls.enabled = false;
      docActions().begin();
    },
    [controls],
  );

  const onMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    const hit = e.ray.intersectPlane(d.plane, new Vector3());
    const doc = getDoc();
    if (!hit || !doc) return;
    const item = activeLayout(doc).items[d.id];
    if (!item) return;
    const target: Vec2 = [hit.x - d.offset[0], hit.z - d.offset[1]];
    const t = dragItemTo(item, target, { settings: doc.settings, room: activeRoom(doc), free: e.altKey, wallThreshold: 0.12 });
    updateItem(d.id, (it) => {
      it.transform = t;
    });
  }, []);

  const onUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      (e.target as unknown as Element).releasePointerCapture(e.pointerId);
      if (controls) controls.enabled = true;
      docActions().end();
    },
    [controls],
  );

  if (!settings) return null;
  return (
    <>
      {items.map((item) => (
        <FurnitureModel
          key={item.id}
          item={item}
          selected={selection?.type === 'item' && selection.id === item.id}
          colliding={collisions.has(item.id)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
      ))}
    </>
  );
}

function Lights({ room }: { room: Room }) {
  const { center, span } = roomFrame(room);
  const half = span * 0.8;
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9a68c', 1.1]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[center.x + span * 0.4, room.ceilingHeight + span * 0.8, center.z + span * 0.3]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={0.5}
        shadow-camera-far={span * 4}
      >
        <object3D attach="target" position={[center.x, 0, center.z]} />
      </directionalLight>
    </>
  );
}

export function Scene3D() {
  const room = useRoom();
  const settings = useSettings();
  if (!room || !settings) return null;
  const { center } = roomFrame(room);
  return (
    <div className="relative h-full w-full bg-[#e9e6e0]" data-testid="scene-3d">
      <Canvas
        shadows="percentage"
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 40, near: 0.05, far: 500, position: [center.x - 6, 7, center.z + 7] }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onPointerMissed={(e) => {
          if (e.button === 0 && ui().tool === 'select') ui().select(null);
        }}
      >
        <color attach="background" args={['#e9e6e0']} />
        <Lights room={room} />
        <RoomShell room={room} unitSystem={settings.unitSystem} />
        <Furniture />
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.02} minDistance={0.5} maxDistance={80} enableDamping={false} />
        <CameraRig room={room} />
      </Canvas>
    </div>
  );
}
