import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, type Mesh, RepeatWrapping, Shape, ShapeGeometry, SRGBColorSpace, Vector2 } from 'three';
import type { Room } from '../domain/schema/project';
import { roomPoints } from '../domain/room/roomOps';
import { FOOT, type UnitSystem } from '../domain/units/units';
import { buildWallMeshes } from './wallGeometry';

const STUB_HEIGHT = 0.12;

function gridTexture(color: string): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function RoomShell({ room, unitSystem }: { room: Room; unitSystem: UnitSystem }) {
  const pts = useMemo(() => roomPoints(room), [room]);
  const thickness = Math.max(...room.walls.map((w) => w.thickness));
  const height = room.ceilingHeight;

  const floor = useMemo(() => {
    // Shape space (x, -z) rotated -90 degrees about X maps back to world (x, 0, z).
    const shape = new Shape(pts.map(([x, z]) => new Vector2(x, -z)));
    return new ShapeGeometry(shape);
  }, [pts]);
  useEffect(() => () => floor.dispose(), [floor]);

  const texture = useMemo(() => {
    const t = gridTexture(room.materials.floor);
    const cell = unitSystem === 'imperial' ? FOOT : 0.5;
    t.repeat.set(1 / cell, 1 / cell);
    return t;
  }, [room.materials.floor, unitSystem]);
  useEffect(() => () => texture.dispose(), [texture]);

  const walls = useMemo(() => buildWallMeshes(pts, thickness, height), [pts, thickness, height]);
  const stubs = useMemo(() => buildWallMeshes(pts, thickness, STUB_HEIGHT), [pts, thickness]);
  useEffect(() => () => [...walls, ...stubs].forEach((w) => w.geometry.dispose()), [walls, stubs]);

  const fullRefs = useRef<(Mesh | null)[]>([]);
  const stubRefs = useRef<(Mesh | null)[]>([]);

  // Dollhouse cutaway: hide walls standing between the camera and the room.
  useFrame(({ camera }) => {
    walls.forEach((w, i) => {
      const toCam = camera.position.clone().sub(w.mid);
      toCam.y = 0;
      const facing = toCam.lengthSq() < 1e-6 || toCam.dot(w.inward) > 0;
      const full = fullRefs.current[i];
      const stub = stubRefs.current[i];
      if (full) full.visible = facing;
      if (stub) stub.visible = !facing;
    });
  });

  return (
    <group>
      <mesh geometry={floor} rotation-x={-Math.PI / 2} receiveShadow name="floor">
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={`w${i}`} ref={(m) => { fullRefs.current[i] = m; }} geometry={w.geometry} castShadow receiveShadow>
          <meshStandardMaterial color={room.materials.walls} roughness={0.95} />
        </mesh>
      ))}
      {stubs.map((w, i) => (
        <mesh key={`s${i}`} ref={(m) => { stubRefs.current[i] = m; }} geometry={w.geometry} visible={false} receiveShadow>
          <meshStandardMaterial color="#8f8a82" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}
