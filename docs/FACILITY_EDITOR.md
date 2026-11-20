# Facility floor plan editor

Run `npm install` and `npm run dev`, then choose **Facility** in PortTracker's top navigation (`#/facility`). Use Node 22. The existing rack pages and saved rack records remain available.

The first visit opens a populated single-floor example with rooms, an IDF, wall plates, access points, a camera, a printer, and planned routes. Its architectural drawing is based on the supplied handoff SVG. The editable overlays are separate from the source drawing.

## Working with a drawing

- Select a drawing tool on the left, then click or drag on the plan. Wall plates support 1, 2, 4 or 6 ports. Every new port starts unmapped; IDF, patch panel, switch, VLAN and route information can remain unknown.
- Select an object to edit its properties on the right. Drag markers and rooms to move them. Selected rooms have corner resize handles; selected paths have editable vertices. Room associations are explicit, including optional parent locations.
- Shift-click or drag a selection box to select multiple objects. Duplicate creates new object and port IDs and unique port labels; port mappings and route endpoint references are cleared on copies.
- Click successive points to draw an orthogonal cable path, tray or conduit. Choose **Finish path** or press Enter. Routes start planned. Marking a route verified does not change port verification.
- Use **Layers** to show, hide, lock, rename, recolor and reorder groups. Lower layers draw on top. Add a custom layer, then assign objects through Properties or select it as the Drawing layer. Removing a populated layer requires confirmation and reassigns its objects.
- **Filters** independently restrict rooms, object types, mapping status, IDFs and known VLANs. Filters and hidden layers never remove saved data.
- **Calibrate scale** uses two selected points and a known distance in feet or meters. Measure and route lengths remain uncalibrated until scale is set. Display units can change without altering calibration. These lengths describe the drawn floor path, excluding rack runs, slack and bend allowances.
- **Symbol width** sets the marker box width for all ports and devices, with labels scaled proportionally. Symbols zoom together with the drawing and keep the same size relative to the floor. Before calibration, width is shown in plan units; afterward it uses the selected feet or meters. For example, enter 1 ft to replace a marker spanning 12 ft. This setting saves with the drawing and leaves item positions, room dimensions and cable paths unchanged. Markers indicate locations rather than actual equipment footprints.
- Use **Select** to drag a device by its icon or label. Turn **Snap to grid** off to position it freely.
- Select a port or device and use **Properties → Item symbol width** for an individual size in calibrated feet or meters (plan units before calibration). Drag a corner handle for proportional resizing around the same location. **Use default symbol width** removes the individual override. Room width and height fields also use calibrated units. Size edits support undo and save with the drawing; locked layers cannot be resized.
- **Properties → Item label** controls each label's font size, placement and X/Y offsets. Device labels can sit above, below, left, right or centered; room labels support corners and center. Positive offsets move right/down. Standalone text labels support font size and offsets too. Labels zoom with the plan, and device labels scale with their symbols. Selection bounds follow the new label position. Changes support undo, save/export and locked layers; **Reset label style** restores the defaults without moving the item.
- Selection outlines enclose the icon and label. Drag empty space, including room interiors, to select items fully enclosed by the selection rectangle; selection does not snap to the grid. Move rooms using their header or border. Shift adds to a selection. Invisible oversized click targets and browser focus outlines do not extend the selection area.
- **Grid spacing** accepts a numeric distance between grid lines. After calibration, **Grid units** can be feet or meters. Changing grid spacing or units leaves existing items, room geometry and cable paths untouched; only later placements and moves use the new snapping interval. Grid settings save with the drawing. If calibration is cleared, a physical-unit grid temporarily uses 10 plan units until recalibrated.
- Fit plan resets pan and zoom. Switching drawing tools or resizing the workspace preserves the current view. The zoom percentage controls only the view; use Calibrate scale to configure real-world measurements. Scroll or pinch to zoom, use Pan or hold Space to pan. Grid snapping uses plan coordinates, independent of zoom. Turn it off for precise image alignment.
- **Rotate / crop** opens an image preview. Rotate left or right in 90° steps, or drag a crop rectangle and choose **Crop to selection**. Numeric crop fields are also available. **Apply image changes** saves the preview as one undoable edit; Cancel leaves the drawing untouched. Rotation and cropping transform all overlays, including hidden and locked layers, so they stay aligned. Crops that exclude objects are blocked. Calibration is preserved unless cropping removes one of its reference points, in which case the scale is cleared. The original uploaded file remains available for download.
- Expand **Network ports** for a searchable table of visible ports and any known terminations.

Shortcuts, outside form fields: **V** select, **H** pan, **O** outlet, **R** location box, **C** cable path, **M** measure, **T** label; **Ctrl/Cmd+Z** undo, **Ctrl/Cmd+Shift+Z** or **Ctrl/Cmd+Y** redo, **Ctrl/Cmd+D** duplicate, **Delete/Backspace** delete, **Ctrl/Cmd+S** save, **Escape** cancel the current drawing or selection.

## Files and persistence

**Change plan** accepts PDF, PNG, JPEG, SVG and WebP files up to 25 MB. PDFs provide a page selector; one selected page becomes this floor's background. SVG uploads are decoded in an image context and rasterized, never inserted as executable page markup. The original upload is retained for download. Raster previews are capped at 3,200 pixels on their longest edge; PDF previews at 2,400 pixels. Changing a background resets calibration. Overlays can be retained only when dimensions match; the user must also verify alignment.

PDF.js and its font, character-map and decoder resources are bundled locally, using the library's [document loading and rendering API](https://mozilla.github.io/pdf.js/examples/). Uploads are processed in the browser.

Drawings autosave in IndexedDB, keyed to the current PortTracker project ID. **Save drawing** explicitly retries saving. Storage failures are visible; unreadable saved drawings are not overwritten automatically. **Export drawing** downloads a versioned JSON backup with overlays, layers, ports, geometry, calibration, background and original upload. **Import JSON** validates a backup before asking to replace the current drawing. The handoff's single-floor sample JSON is also accepted.

Floor drawings have their own save/export controls. The rack project's JSON export does not include the IndexedDB floor drawing; export both when backing up the whole workspace. Rack and port references are optional metadata, not synchronized connections.

Examples: [`sample-floorplan.svg`](../public/facility/sample-floorplan.svg) and [`sample-project.json`](../public/facility/sample-project.json). Browser checks produce `artifacts/facility-desktop.png` (1440×900) and `artifacts/facility-mobile.png`.

## Delivered scope

- [x] Facility navigation, example drawing, responsive desktop/tablet/mobile panels.
- [x] Pan, wheel/pinch zoom, fit/reset, selection, multiple selection, history, delete and duplicate.
- [x] Editable room geometry, locations, markers, wall plates and stable port identities.
- [x] Editable orthogonal paths, trays and conduits; optional endpoints and explicit route status.
- [x] Functional layers, locks, ordering, filters and properties.
- [x] Calibrated measurements, unit conversion, grid and snap-to-grid.
- [x] Background uploads, PDF page selection, validated JSON import/export and browser autosave.
- [x] Searchable ports table and optional references to existing distribution frames/VLANs.
- [ ] Optional snap-to-wall and automatic room containment suggestions.
- [ ] Automatic routes, multi-floor/riser planning and full rack-to-outlet tracing.
- [ ] Backend, accounts, cloud synchronization, native app and certification workflows.

Run `npm test` for model checks, `npx playwright test tests/facility.spec.ts` for browser workflows, and `npm run build` for the production build.
