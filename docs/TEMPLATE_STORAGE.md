# Equipment template storage and portability

## Implemented now

In local mode, templates remain in the project-level `templates` catalog in browser storage. Server mode stores them as related template/revision/port records with file assets; see [Backend setup](BACKEND.md). Equipment references a template ID; images and maps are not duplicated per installed device. A complete project backup includes that catalog.

New YAML imports retain the original UTF-8 text in `template.source.yaml`, alongside the source filename, manufacturer, and model. Comments, unused fields, and line endings survive ordinary save/export/import. Changes made in the mapper are separate from this original source; downloading the YAML does not regenerate it from the edited map.

The importer actively uses manufacturer, model, rack height, network `interfaces`, patch-panel `front-ports`, and switch `console-ports`. Console ports retain their source section/type and serial connector, and can be mapped to either image. Unknown console connector types appear as **Other** while the original type remains available. Power components, module bays, console-server ports, and other unsupported data remain in the source YAML without becoming active app components. Serial console cabling is not implemented.

Old templates do not have recoverable source text. **Edit template → Source YAML → Attach source YAML** attaches a file with matching manufacturer, model, and rack height. It preserves the existing map; it does not reconcile or append newly discovered ports. Use **Add port** for a missing socket or import the YAML as a new template. Legacy templates without source text remain usable and exportable.

### Portable template package

**Export template** downloads a self-contained `.porttracker-template.json` file:

```json
{
  "format": "porttracker-template",
  "schemaVersion": 1,
  "template": {
    "id": "custom-example",
    "name": "Example switch",
    "source": { "manufacturer": "Example", "model": "Switch", "filename": "switch.yaml", "yaml": "..." },
    "imageSrc": "data:image/png;base64,...",
    "imageWidth": 1600,
    "imageHeight": 120,
    "rearImage": { "imageSrc": "data:image/png;base64,...", "imageWidth": 1600, "imageHeight": 120 },
    "ports": []
  }
}
```

This illustrates the envelope, not a complete valid template. The actual export includes equipment kind, height, port count/starting number, description, and all mapped ports: source names/types/sections, labels, manual-port metadata, console or network physical settings, front/rear face, and normalized socket centers and sizes. Coordinates are fractions of the original image, not rendered screen pixels. Neither installed equipment nor its connections, VLAN assignments, locations, or notes are included.

**Import saved template** validates the format/version, template fields, geometry, embedded raster images, decoded dimensions, and source YAML. It creates a new template ID and disambiguates the name. It never overwrites an installed template. Bundled templates can also be exported; their locally bundled source and image become embedded in the package. Excluded source ports stay excluded from the exported map.

Current limits: 8 MiB package file, 512 KiB source YAML, 1 MiB per uploaded image, 8192 pixels per image side / 32 megapixels, 1–256 mapped ports, 30 custom templates, and a shared 4,000,000-byte budget counting encoded image characters plus UTF-8 source bytes. Browser storage may impose a lower limit. Source-only downloads are also available. Unsupported package versions fail explicitly rather than being guessed.

## Backend design and implementation

The backend uses PostgreSQL for structured records and relationships, and an asset-store abstraction backed by local server files for images. An S3-compatible adapter can be added later. Keep the portable JSON format as an import/export boundary, rather than storing the entire project or base64 images as one database row.

| Record | Suggested contents |
| --- | --- |
| `equipment_templates` | UUID, workspace/tenant ID, name, manufacturer/model, current published revision ID, timestamps |
| `template_revisions` | UUID, template UUID, revision number, equipment kind/height, default numbering, original YAML as `text`, original filename, parsed source metadata as `jsonb`, importer version, creation/audit details |
| `template_revision_ports.port_identity` | Stable port UUID derived from template and physical slot; reused across revisions while existing used-template slot identities remain fixed |
| `template_revision_ports` | Revision UUID + stable port UUID; display order, label, source section/name/type, function, connector/media defaults, face, image reference, normalized x/y/width/height |
| `assets` | UUID, tenant ID, immutable object-storage key, SHA-256 hash, MIME type, byte size, pixel dimensions; revision/face associations reference these assets |
| `equipment` | UUID, rack/frame, bottom U, equipment label, pinned template revision UUID, device-specific numbering/stack details |
| `device_ports` | UUID, equipment UUID, stable template port UUID, instance overrides, VLAN assignment, notes and location relationships as appropriate |
| `cables` / endpoints | Cable UUID, endpoint device-port UUIDs, physical cable properties; transactional constraints prevent double occupation |

Store commonly filtered data in typed columns and foreign keys. Use JSONB for original parsed metadata and evolving optional component attributes. JSONB supports indexing but does not preserve formatting, key order, or comments; retain the original YAML separately as text. See [PostgreSQL JSON types](https://www.postgresql.org/docs/current/datatype-json.html).

### Revision and identity rules

1. Publish immutable template revisions. Editing a library template creates a new revision; existing equipment stays pinned to its chosen revision.
2. Give every port a stable UUID independent of its displayed name or number. `MGMT`, `Console`, `ge-0/0/0`, and `B001` are labels, not relational primary keys. Equipment UUIDs and device-port UUIDs also stay fixed during rack moves.
3. Make upgrading installed equipment explicit. Compare revisions, map stable port identities, preview additions/removals, and reject removal or conversion of connected ports until their connections are resolved. Apply the upgrade atomically.
4. Preserve source provenance separately from edits. Attaching original YAML or changing a label must not silently re-create device-port records.
5. Keep VLAN, location, connection state, notes, and physical overrides on installed records. Derive inherited panel VLANs and switch patch locations from their connected device ports; avoid competing copies on templates.

The local wire format still uses template slot positions and numeric port offsets for compatibility. The server migration assigns stable device/port UUIDs, rewrites relational cable and SMB references, and preserves the legacy labels in exports. Installed equipment records reference template revisions. Saving a used template in server mode asks for confirmation before creating a revision and applying that explicit project edit to its devices. There is no separate per-device revision-upgrade selection screen yet. Template package format remains version 1; server identity annotations in complete project backups are remapped when imported as a new project.

### Assets, API and import/export

Store images as immutable blobs, with database rows for ownership, hash, size, MIME type and dimensions. Validate and decode uploads on the server; apply tenant authorization to both asset URLs and relational records. Deduplicate within authorized scope. Do not fetch arbitrary image URLs supplied by a package. Keep original YAML bounded and parse it safely without executable tags or aliases.

A backend project load/export assembles relational records and image blobs into the existing portable format. Template-only exports use the loaded template. Import first validates and stages assets, then atomically creates a new template/revision and port records; clean up staged assets if the transaction fails. Remap package-local IDs to new database UUIDs by default. Updating an existing library entry should be a separate, explicit revision workflow.

Package `schemaVersion` describes the file format, not a template's revision number. If stable exported port IDs or additional component types require a format change, introduce a new package version with a tested v1 migration. Keep any future project backup format separate from a single-template package. Server-side validation remains authoritative even when the browser already checked the file.
