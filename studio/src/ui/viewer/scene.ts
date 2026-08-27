/**
 * Three.js scene construction for a concept.
 * Kept free of React so it can be built, disposed and screenshotted directly.
 */
import * as THREE from 'three';
import type { Concept, Materials, Point, Project } from '@/domain/types';

const WALL_COLOURS: Record<Materials['wall'], number> = {
  brick: 0xa8503c,
  render: 0xe4dfd2,
  timber: 0xc9b189,
  stone: 0xbdb6a6,
};

const ROOF_COLOURS: Record<Materials['roof'], number> = {
  slate: 0x5b626b,
  clay: 0xb5583a,
  metal: 0x4a5158,
};

export interface SceneHandles {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
}

/** Convert site metres (x East, y North) to Three coordinates (x, up, -y). */
function v3(p: Point, height = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x, height, -p.y);
}

function shapeFrom(points: readonly Point[]): THREE.Shape {
  const shape = new THREE.Shape();
  const first = points[0]!;
  shape.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i]!.x, points[i]!.y);
  shape.closePath();
  return shape;
}

function groundPlane(points: readonly Point[], colour: number, y: number): THREE.Mesh {
  const geo = new THREE.ShapeGeometry(shapeFrom(points));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: colour, roughness: 1, side: THREE.DoubleSide }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/** Simple pitched roof prism sitting on the eaves. */
function pitchedRoof(w: number, d: number, eave: number, rise: number, colour: number): THREE.Mesh {
  const hw = w / 2;
  const hd = d / 2;
  const ridge = eave + rise;
  const verts = new Float32Array([
    -hw, eave, -hd, 0, ridge, -hd, 0, ridge, hd,
    -hw, eave, -hd, 0, ridge, hd, -hw, eave, hd,
    hw, eave, -hd, hw, eave, hd, 0, ridge, hd,
    hw, eave, -hd, 0, ridge, hd, 0, ridge, -hd,
    -hw, eave, -hd, hw, eave, -hd, 0, ridge, -hd,
    -hw, eave, hd, 0, ridge, hd, hw, eave, hd,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8, side: THREE.DoubleSide }),
  );
  return mesh;
}

export function buildScene(project: Project, concept: Concept): SceneHandles {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc3e6);
  scene.fog = new THREE.Fog(0xb9d3ea, 180, 620);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = (o: THREE.Mesh) => {
    disposables.push(o.geometry);
    if (Array.isArray(o.material)) o.material.forEach((m) => disposables.push(m));
    else disposables.push(o.material);
  };

  // Lighting: warm low sun plus sky/earth bounce. Real-time shadow mapping is
  // deliberately NOT used - it is the heaviest part of the pipeline and can wedge
  // older GPUs. A cheap baked contact shadow under the building gives grounding
  // instead (added below).
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x53452f, 0.85));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.35);
  sun.position.set(90, 110, 60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbfd4ef, 0.35);
  fill.position.set(-70, 50, -40);
  scene.add(fill);

  // Surrounding context ground.
  const context = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ color: 0x6f8a52, roughness: 1 }),
  );
  context.rotation.x = -Math.PI / 2;
  context.position.y = -0.12;
  scene.add(context);
  track(context);

  const ring = project.site.boundary.points;
  if (ring.length >= 3) {
    const plot = groundPlane(ring, 0x7f9a5e, 0);
    scene.add(plot);
    track(plot);

    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([...ring, ring[0]!].map((p) => v3(p, 0.12))),
      new THREE.LineBasicMaterial({ color: 0x2f4a6d }),
    );
    scene.add(outline);
    disposables.push(outline.geometry, outline.material);
  }

  // Amenity wash.
  if (concept.amenityPolygon.length > 2) {
    const pts = concept.amenityPolygon;
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = 0.06;
      arr[i * 3 + 2] = -p.y;
    });
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const cloud = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x5fbf7f, size: 1.1, sizeAttenuation: true }),
    );
    scene.add(cloud);
    disposables.push(geo, cloud.material);
  }

  // Driveway and parking.
  if (concept.driveway.length >= 2) {
    const curve = concept.driveway;
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1]!;
      const b = curve[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.5) continue;
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(3, len),
        new THREE.MeshStandardMaterial({ color: 0x53585f, roughness: 0.95 }),
      );
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = -Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      strip.position.set((a.x + b.x) / 2, 0.05, -(a.y + b.y) / 2);
      scene.add(strip);
      track(strip);
    }
  }

  for (const bay of concept.parking) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(bay.w, bay.d),
      new THREE.MeshStandardMaterial({ color: 0x6c727a, roughness: 0.95 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -(bay.rotationDeg * Math.PI) / 180;
    mesh.position.set(bay.x, 0.07, -bay.y);
    scene.add(mesh);
    track(mesh);
  }

  // The building itself.
  const fp = concept.footprint;
  const storeyHeight = 2.9;
  const eave = concept.storeys * storeyHeight;
  const rise = Math.min(fp.w, fp.d) * 0.28;
  const group = new THREE.Group();
  group.position.set(fp.x, 0, -fp.y);
  group.rotation.y = (fp.rotationDeg * Math.PI) / 180;

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(fp.w, eave, fp.d),
    new THREE.MeshStandardMaterial({ color: WALL_COLOURS[concept.materials.wall], roughness: 0.9 }),
  );
  walls.position.y = eave / 2;
  group.add(walls);
  track(walls);

  const roof = pitchedRoof(fp.w + 0.5, fp.d + 0.5, eave, rise, ROOF_COLOURS[concept.materials.roof]);
  group.add(roof);
  track(roof);

  // Simple glazing bands so the massing reads as a dwelling.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x2b3946,
    roughness: 0.15,
    metalness: 0.1,
  });
  for (let s = 0; s < concept.storeys; s++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(fp.w * 0.62, 1.25, 0.12), glass);
    band.position.set(0, s * storeyHeight + 1.5, fp.d / 2 + 0.02);
    group.add(band);
    disposables.push(band.geometry);
  }
  disposables.push(glass);

  // Cheap contact shadow: a radial-gradient sprite laid flat under the building.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d');
  if (sctx) {
    const grad = sctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(fp.w * 1.7, fp.d * 1.7),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(fp.x, 0.04, -fp.y);
  scene.add(shadowMesh);
  disposables.push(shadowMesh.geometry, shadowMesh.material, shadowTex);

  scene.add(group);

  // Frame the plot.
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);
  const radius = Math.max(48, Math.hypot(fp.w, fp.d) * 3.4);
  camera.position.set(fp.x + radius * 0.72, radius * 0.52, -fp.y + radius * 0.72);
  camera.lookAt(fp.x, eave * 0.4, -fp.y);

  return {
    scene,
    camera,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
