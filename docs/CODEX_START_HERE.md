# Codex — Facility Floor Plan Editor: START HERE

## Mission: build the complete example page FIRST
Build a standalone, runnable, polished, responsive **Facility Floor Plan Editor** page for the Network Cabinet Manager. The first deliverable is a working UI that visually matches the established GSMS-style mockups: dark navy top navigation, light-gray/white panels, detailed floor plan canvas in the center, vertical drawing tools at left, and layers/filters/properties at right. Do NOT begin a backend, database, authentication, APK, sync engine, or unrelated pages. Preserve a path for future integration with the separate rack manager.

## First-run expectations
1. `npm install` then `npm run dev` starts the application locally.
2. The initial page immediately displays a realistic example floor plan (use bundled sample SVG) with labeled rooms, IDF, network ports, APs, cameras, and a few sample routes. No blank canvas on first load.
3. Every advertised primary tool works; no inert buttons or purely decorative toggles.
4. Capture a screenshot at desktop 1440x900 and compare with the reference concept. Improve alignment, density, readability and iconography before completion.
5. Supply a short README with run instructions and a checklist of implemented/remaining features.

## Phase 1 scope (implement now)
- Upload PDF, PNG, JPEG, SVG floor plans; render PDF page(s) to an image or canvas for editing; retain original file reference in project where feasible. Use a safe SVG handling strategy (sanitize or rasterize untrusted uploads); no inline execution of user SVG scripts.
- Pan, zoom, fit, reset, select/multi-select, keyboard shortcuts, undo/redo, delete, duplicate, and editable object properties.
- Rectangle location drawing: drag to create; assign location name, type, color, notes; move/resize and rename later. Locations are overlays, NOT modifications to the source image. Allow overlapping areas and explicit parent/location association when needed.
- Place outlets and multi-port wall plates (1/2/4/6 ports); assign unique IDs, optional room/location, media type, status. An outlet MUST be savable with unknown IDF, patch panel, switch port and cable path.
- Place IDF/rack markers, APs, cameras, printers and generic devices.
- Draw orthogonal polylines for cable paths, trays and conduits; move vertices; distinguish planned vs verified routes. Paths are optional for every endpoint.
- Layers panel on RIGHT: toggle visibility, lock/unlock, add custom layers, rename, reorder, choose color, delete empty layers or reassign objects with confirmation. Layers must affect rendering and editing, not delete data when hidden.
- Filters on RIGHT: room/location, device type, mapping status, IDF, VLAN (when known). Filters must be independent of layers.
- Selected-object properties in RIGHT panel; outlet properties permit unknown values and status updates. Show details for multiple selected objects appropriately.
- Drawing scale: calibrate from two points and a known real-world distance; unit choice ft/m; show 'uncalibrated' until set. Measurements/lengths must never claim accuracy before calibration. Grid and snap-to-grid / optional snap-to-wall controls.
- Save/load a versioned portable JSON project including background reference or embedded small image, geometry, locations, layers, devices, ports, routes, calibration and schema version. Provide import/export UI and browser autosave (IndexedDB preferred for large drawings; localStorage acceptable only for small demo metadata). Save is NOT a backend sync.
- Responsive behavior: desktop three-panel layout; tablet collapsible side panels; mobile touch-friendly inspection/placement with pinch zoom and large tap targets.

## Design details
Top: 'Network Cabinet Manager' navy navigation, Facility highlighted, Building/Floor selectors, zoom controls, Undo/Redo, Save, Fit.
Left: Select, Pan, Outlet, Multi-Port Plate, IDF/Rack, AP, Camera, Printer, Device, Draw Location Box, Cable Path, Cable Tray, Conduit, Measure, Label; tooltips and keyboard shortcuts.
Center: imported plan or bundled example; crisp grid/blueprint, selectable markers, room boxes with editable labels, route lines and scale bar. Show status by symbol/outline rather than VLAN color alone.
Right: tabs/panels for Layers, Filters, Properties. Layer visibility checkboxes and 'Add Layer'. Filtering controls with clear-all. Selected item form.
Bottom: optional collapsible Network Ports table (search, label, location, status, IDF, patch panel, switch/VLAN when known). Do not let table obscure canvas on typical laptop screens.
Use clean iconography (Lucide acceptable), coherent spacing, accessible contrast, keyboard focus and helpful empty states. Avoid placeholder icons, stock UI screenshots, or using a static mockup as the interactive surface.

## Important domain rules
- Physical outlet location is separate from physical cable route, patch panel termination, switch patch connection and logical VLAN. Never require one to create another.
- Outlet/port identifiers must be stable and unique within project; moving a marker must not change its ID.
- A room box is an editable geometry object with a name, not merely a text label.
- A route is a polyline of editable points with source/destination optional. Never invent a route from outlet placement.
- VLAN is logical metadata, not an assumption about physical cable color.
- Port statuses: planned, unmapped, partially mapped, verified; do not mark verified automatically from drawing a path.
- A drawing coordinate system must be independent of viewport zoom/pan; store geometry in plan coordinates. For measured distances use calibrated physical units, not screen pixels.
- Future racks/ports integration: retain stable IDs and optional references; do not build rack elevation or database now.

## Acceptance tests (demonstrate in running page)
1. Start with visible sample plan, room boxes, ports, IDF and paths.
2. Draw a box around an area, name 'Office 204', resize and move it; rename it.
3. Place a four-port plate inside Office 204 with no cable route or termination, save, reload and confirm it persists.
4. Hide 'Network Outlets' layer: outlets disappear; re-enable and they return unchanged.
5. Add a custom 'Future Expansion' layer, assign an object, toggle visibility, rename layer.
6. Filter to 'Unmapped' ports; clear filters restores all eligible objects.
7. Draw and edit a cable path; leave an unrelated outlet unconnected.
8. Calibrate scale with two points and a known length; measure a segment and show appropriate units.
9. Undo and redo moving a marker; save/export project, reload/import and recover layout.
10. Test desktop and narrow/mobile viewport; no blank rendering, uncaught console errors or unclickable controls.

## Out of scope until approval
Node/Express API, PostgreSQL, user accounts, cloud storage, live switch discovery, VLAN configuration changes, native APK, background offline sync, multiuser conflicts, full cable certification workflow, and complex auto-routing.

## Handoff
Deliver runnable source, sample SVG, project example JSON, README, screenshots, and a concise implemented/not-implemented list. If a feature cannot be completed, do not claim it works; surface it clearly. Prioritize a fully functional, visually faithful page over extra architecture.
