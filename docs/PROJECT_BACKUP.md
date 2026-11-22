# Project backup coverage

**Export** in the header and **Export project** in either workspace download `porttracker-project.json`. One file contains the active rack project and its associated facility drawing. In server mode, the same format is reconstructed from PostgreSQL and file assets; current unsaved editor changes can also be exported. Account/session records and administrative project history are not part of a portable project backup. Template-only export remains available separately for sharing a reusable template.

## Included data

| Browser store | Included in the unified backup |
| --- | --- |
| `localStorage["porttracker.project"]` | Site/buildings; active and archived distribution frames; racks, equipment, stack membership, port numbers; connections; VLAN/media/location assignments and notes; calibration and rack spacing; shared VLAN/location/cable stock/color configuration; custom templates with front/rear images, port maps, original YAML when retained; saved unit, rack zoom and rack face preferences |
| IndexedDB `porttracker-facility` → `plans[project.id]` | Facility background and original uploaded file, all layers including hidden/locked ones, objects, SMB/wall-plate ports and references, routes/connectors, labels, appearance, calibration, grid spacing and tool size defaults |
| Current in-memory project/drawing | Latest committed edits, even if browser persistence failed or a drawing write is pending |

The original upload is included only when it exists in the drawing record. Previously discarded source YAML cannot be reconstructed. Bundled example images remain references to assets shipped with PortTracker; user-uploaded images/files are embedded.

Not included: temporary selections, view filters, open inspectors, map pan/zoom, uncommitted form input, unfinished paths, undo/redo history, browser cache/code, unrelated browser data, and old drawings belonging to replaced projects. Those are not active persisted project records. The old `porttracker.configuration` and length-unit storage keys are migration inputs; their effective current values are already in the project configuration/preferences.

The audit found that the previous project export serialized localStorage project data only, while drawing export serialized only its floor plan. Neither was a complete workspace backup on its own.

## Format and restore

The existing project schema remains version 2. Unified backup files add these top-level fields:

```json
{
  "kind": "porttracker-backup",
  "backupVersion": 1,
  "schemaVersion": 2,
  "id": "original-project-id",
  "facilityPlan": null
}
```

This is an envelope illustration; actual files also contain all required project fields. `facilityPlan` is the full versioned floor-plan object, or explicit `null` if no drawing has been saved. A missing field in a unified backup is an error, not permission to discard a drawing. Rack and drawing schemas are validated before import. Files up to 128 MiB are accepted, retaining the existing per-template and per-drawing limits.

Distribution Frames shows a preview with rack/connection counts and drawing presence. Facility requests confirmation with the project and drawing scope. **Cancel** leaves the current data intact. A unified import replaces both sides, plus templates, configuration and saved preferences. IDs referenced by SMBs, ports, racks, frames and cables remain unchanged.

To avoid half-restored projects across two different browser storage systems, restore stages the drawing under a fresh internal project UUID, waits for its IndexedDB transaction to finish, then switches the localStorage active project. A storage failure leaves the previous active project/drawing intact; failed staging is cleaned up when storage permits. Old drawing records are not deleted automatically. The new internal project UUID is not an equipment or connection identity.

The app keeps a per-tab memory copy of drawing saves, allowing export after a failed write or navigation. This does not make failed writes durable across closing/reloading the tab: export before leaving when a save failure is reported. If the saved drawing cannot be read and no current in-memory copy exists, export fails visibly instead of silently omitting it.

## Older backups

- Legacy rack project and single-rack JSON files remain importable. The preview identifies the absent drawing. They start with no saved drawing rather than accidentally reusing a stale map sharing the imported ID.
- Legacy drawing-only files can be imported from Facility. They replace the drawing only; rack data remains intact.
- To combine an older pair, import the rack backup, then its drawing backup in Facility, then export the complete project.
