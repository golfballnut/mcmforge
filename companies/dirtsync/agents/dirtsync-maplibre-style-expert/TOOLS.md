# TOOLS.md — DirtSync MapLibre Style Expert

## Domain References

### MapLibre Style Spec (Primary Reference)
- **Full spec:** https://maplibre.org/maplibre-style-spec/
- **Layers:** https://maplibre.org/maplibre-style-spec/layers/
- **Sources:** https://maplibre.org/maplibre-style-spec/sources/
- **Glyphs:** https://maplibre.org/maplibre-style-spec/glyphs/
- **Sprite:** https://maplibre.org/maplibre-style-spec/sprite/
- **Expressions:** https://maplibre.org/maplibre-style-spec/expressions/

### MapLibre Native iOS API
- **GitHub:** https://github.com/maplibre/maplibre-native
- **iOS docs:** https://maplibre.org/maplibre-native/ios/api/

---

## Glyph PBF Inspection

Glyph files are binary Protocol Buffer files. You can inspect them with the `maplibre-gl-inspect` CLI or decode manually.

### Check which glyph ranges exist in the bundle
```bash
ssh dirtsyncmini@100.125.184.57 \
  'find /Users/dirtsyncmini/DirtSync/DirtSync/DirtSyncApp/Resources/glyphs -name "*.pbf" | sort'
```
Expected output (contiguous 256-char ranges):
```
.../glyphs/Open Sans Regular/0-255.pbf
.../glyphs/Open Sans Regular/256-511.pbf
.../glyphs/Open Sans Regular/512-767.pbf
.../glyphs/Open Sans Bold/0-255.pbf
.../glyphs/Open Sans Bold/256-511.pbf
```
**Red flag:** any gap in the range sequence (e.g. `0-255.pbf` exists but `256-511.pbf` is missing). MapLibre silently falls back for missing ranges — no error, just tofu characters.

### Decode a PBF glyph range (see what characters it covers)
```bash
# Install pbf decoder if needed
pip3 install mapbox-vector-tile 2>/dev/null || true

# Or use xxd to inspect the header (look for font name + range)
xxd /path/to/0-255.pbf | head -20
```

### Verify glyph path in style JSON matches actual directory structure
```bash
# Extract the glyphs field from style JSON
python3 -c "
import json
with open('style-dark-matter.json') as f:
    s = json.load(f)
print('glyphs:', s.get('glyphs', 'NOT SET'))
print('sprite:', s.get('sprite', 'NOT SET'))
"
```
The `{fontstack}` placeholder must match the font name used in your layer `"text-font"` arrays. If the style says `"Open Sans Regular"` but your glyph directory is `"NotoSans-Regular"`, labels will silently fail.

---

## Sprite Atlas Inspection

### Verify sprites.json is valid and coordinates are within image bounds
```bash
python3 - <<'EOF'
import json
from PIL import Image

with open('sprites.json') as f:
    sprites = json.load(f)

img = Image.open('sprites.png')
w, h = img.size
errors = []

for name, rect in sprites.items():
    x, y, rw, rh = rect['x'], rect['y'], rect['width'], rect['height']
    if x + rw > w or y + rh > h:
        errors.append(f"{name}: coords ({x},{y}) + size ({rw}x{rh}) exceeds image {w}x{h}")

if errors:
    print("ERRORS:")
    for e in errors: print(" ", e)
else:
    print(f"OK: {len(sprites)} sprites, all within {w}x{h} bounds")
EOF
```

### Verify @2x sprite coords are exactly 2x the @1x coords
```bash
python3 - <<'EOF'
import json

with open('sprites.json') as f:
    s1 = json.load(f)
with open('sprites@2x.json') as f:
    s2 = json.load(f)

mismatches = []
for name in s1:
    if name not in s2:
        mismatches.append(f"{name}: missing from @2x")
        continue
    r1, r2 = s1[name], s2[name]
    # @2x coords should be exactly 2x the @1x coords
    for field in ('x', 'y', 'width', 'height'):
        if r2.get(field) != r1.get(field, 0) * 2:
            mismatches.append(f"{name}.{field}: @1x={r1.get(field)} @2x={r2.get(field)} (expected {r1.get(field,0)*2})")

if mismatches:
    print("MISMATCHES:")
    for m in mismatches: print(" ", m)
else:
    print("OK: all @2x coords are exactly 2x of @1x")
EOF
```

---

## Style JSON Validation

### Validate JSON syntax
```bash
python3 -m json.tool DirtSync/DirtSyncApp/Resources/style-dark-matter.json > /dev/null && echo "VALID JSON" || echo "INVALID JSON"
```

### Check required top-level keys
```bash
python3 - <<'EOF'
import json, sys

with open('style-dark-matter.json') as f:
    s = json.load(f)

required = ['version', 'name', 'sources', 'sprite', 'glyphs', 'layers']
for key in required:
    val = s.get(key)
    if val is None:
        print(f"MISSING: {key}")
    elif key == 'sources':
        print(f"OK: sources = {list(val.keys())}")
    elif key == 'layers':
        print(f"OK: layers count = {len(val)}")
    else:
        print(f"OK: {key} = {str(val)[:80]}")
EOF
```

### Check source type vs MBTiles consistency
```bash
python3 - <<'EOF'
import json, sqlite3, os

with open('style-dark-matter.json') as f:
    s = json.load(f)

for src_id, src in s.get('sources', {}).items():
    url = src.get('url', src.get('tiles', [''])[0] if 'tiles' in src else '')
    print(f"Source '{src_id}': type={src.get('type')} url={url[:80]}")
    if 'mbtiles' in str(url):
        path = url.replace('mbtiles://', '').replace('file://', '')
        if os.path.exists(path):
            conn = sqlite3.connect(path)
            fmt = conn.execute("SELECT value FROM metadata WHERE name='format'").fetchone()
            print(f"  MBTiles format: {fmt[0] if fmt else 'NOT FOUND'}")
            conn.close()
        else:
            print(f"  FILE NOT FOUND at: {path}")
EOF
```

---

## MBTiles Dev Loop (Local Tile Preview)

Use `mbtileserver` to preview tiles locally without the iOS simulator:

```bash
# Install (macOS)
brew install mbtileserver

# Serve your mbtiles on localhost:8080
mbtileserver --dir DirtSync/DirtSyncApp/Resources/ --port 8080

# Open in browser to verify tile rendering:
# http://localhost:8080/services/trails/map#14/38.22/-81.33
```

This lets you visually verify that tile data is correct before debugging the iOS style loading chain.

---

## Runtime Diagnostic Hooks (Temporary — Remove Before PR)

Add these to `MapCoordinator.mapView(_:didFinishLoadingStyle:)` during diagnosis:

```swift
// Paste inside didFinishLoadingStyle callback:
#if DEBUG
print("STYLE_LOADED: \(style.name ?? "unnamed") sources=\(style.sources.count) layers=\(style.layers.count)")
style.layers.enumerated().forEach { i, layer in
    print("  LAYER[\(i)]: \(layer.identifier) visible=\(layer.isVisible)")
}
if let source = style.source(withIdentifier: "openmaptiles") {
    print("  SOURCE openmaptiles: \(source)")
} else {
    print("  SOURCE openmaptiles: NOT FOUND")
}
#endif
```

---

## Known-Good Patterns

### Correct glyph entry in style JSON
```json
{
  "glyphs": "file://{BUNDLE_PATH}/glyphs/{fontstack}/{range}.pbf"
}
```
`{BUNDLE_PATH}` must be resolved at runtime — `MapStyleManager.swift` injects the actual bundle path before passing the style to `MLNMapView`. Never hardcode `/Users/dirtsyncmini/...`.

### Correct sprite entry in style JSON
```json
{
  "sprite": "file://{BUNDLE_PATH}/sprites/sprites"
}
```
No extension. MapLibre appends `.json` and `.png` (and `@2x` variants) automatically based on screen scale.

### Correct vector source referencing MBTiles
```json
{
  "sources": {
    "openmaptiles": {
      "type": "vector",
      "url": "mbtiles://{BUNDLE_PATH}/trails.mbtiles"
    }
  }
}
```

### Layer z-order (bottom to top)
```json
{
  "layers": [
    { "id": "background",      "type": "background" },
    { "id": "land",            "type": "fill",   "source": "openmaptiles", "source-layer": "landuse" },
    { "id": "water",           "type": "fill",   "source": "openmaptiles", "source-layer": "water" },
    { "id": "road",            "type": "line",   "source": "openmaptiles", "source-layer": "transportation" },
    { "id": "trail-casing",    "type": "line",   "source": "openmaptiles", "source-layer": "trail" },
    { "id": "trail-line",      "type": "line",   "source": "openmaptiles", "source-layer": "trail" },
    { "id": "trail-label",     "type": "symbol", "source": "openmaptiles", "source-layer": "trail" }
  ]
}
```
Trail layers added by `MapCoordinator+TrailLayers.swift` are inserted ABOVE this stack at runtime.

---

## Budget + Cost Rationale

- **Target:** $2/day
- **Hard cap:** $6/day using Claude Sonnet
- **Why Sonnet, not Haiku:** Style JSON debugging requires multi-file JSON diffing and MapLibre spec recall. Haiku misses subtle layer ID mismatches. Sonnet is the minimum viable model.
- **Why $6 cap:** A typical style bug (cream-background, missing glyph range) is 2-4 iterations max. If you are at $5 without a passing test, the root cause is not in the style JSON — escalate to Map Rendering Expert rather than burning more budget.
- **Diagnostic prints add zero cost** — they run on the simulator, not in the agent. Always instrument first, reason second.
