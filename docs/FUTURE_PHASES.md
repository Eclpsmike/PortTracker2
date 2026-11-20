# Roadmap

Implemented locally: MDF/IDF location management, a site/building/location hierarchy, shared VLAN and stock settings, persistent layouts and port assignments, archive/restore, and validated project export/import.

Remaining work:

1. Configurable rack sizes and equipment placement; MDF–IDF uplinks with measured inter-location pathways. Improve port-level physical calibration: equipment templates with measured port center offsets, rack/manager dimensions, cable entry and bend allowances, overhead spacing, physical route constraints, manual overrides, stocked cable lengths and recommended lengths.
2. Standalone backend: Node.js/Express API with PostgreSQL for sites, IDFs, racks, equipment, ports, VLAN documentation, physical cables, pathways and audit history.
3. Android app: Capacitor APK using the same UI with mobile touch-friendly views.
4. Offline-first field work: durable device-local storage (prefer SQLite), queued operations, versioned/idempotent sync, explicit conflicts for competing port/cable edits, retry/recovery and visible pending status.
5. Production hardening: roles, validation, backups, testing, optional read-only discovery, labeling/QR and reporting.

The current saved-project milestone uses browser-local storage and the existing 42U equipment template. Server sharing, custom equipment layouts, uplinks, Android, and synchronization remain separate milestones.
