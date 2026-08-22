# Blender landscape pipeline

Builds a high-quality Dashlands landscape (`.glb`) in Blender from a scheme
generated in the ArchForm editor, then loads it back into the interactive 3D
viewer. **Internal working scenario — procedural massing, not a surveyed or
architectural model.**

## Files
- `build_landscape.py` — Blender script (bpy). Reads `scene.json`, builds
  terrain, site slab, road ribbon, per-type Sussex homes (body + pitched roof),
  attenuation SuDS and buffer-edge trees, and exports `landscape.glb`.
- `scene.json` — the exported scheme (centroid-relative site metres, x east /
  y north; heights on Z). Regenerate it from the editor at any time.
- `landscape.glb` — the built model (checked in so the viewer works without
  Blender). Regenerate whenever the scheme changes.

## Workflow
1. **In the editor** (`/editor.html`): import the boundary, draw the road,
   *Generate scheme*, add SuDS. Under **Landscape · Blender** click
   **⬇ Export scene.json** and save it into this `blender/` folder
   (overwrite `scene.json`).
2. **Build the model** (PowerShell / Git Bash):
   ```bash
   "/c/Program Files/Blender Foundation/Blender 3.3/blender.exe" \
     --background --python build_landscape.py -- scene.json landscape.glb
   ```
   (Blender 3.3.1 verified at `C:\Program Files\Blender Foundation\Blender 3.3\blender.exe`.)
3. **View it**: back in the editor, switch to **3D** and click
   **▲ Load Blender landscape**. It replaces the procedural ground/road/homes/
   SuDS; the Blender terrain drops in aligned because the script builds in the
   app's coordinate frame (site (x,y) → three (x, height, −y)).

## Notes
- Coordinates are centroid-relative, matching the app, so the model needs no
  repositioning on load.
- Materials use sRGB→linear-converted Principled BSDF base colours (Hailsham
  vernacular palette) and are exported double-sided.
- The dev server (`start-preview.js`) serves `.glb` as `model/gltf-binary`.
- Keep higher-quality Blender *renders* (stills) separate from this real-time
  `.glb` if you want presentation images — this file is optimised for the viewer.
