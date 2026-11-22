# PortTracker

PortTracker now supports a PostgreSQL-backed shared workspace with login, roles, revision-checked saves, file storage, and migration from project backups. See [Backend setup](docs/BACKEND.md) for setup, credentials, development commands, and testing. Set `VITE_STORAGE_MODE=server` for the backend or `local` for the browser-only workflow.


A standalone React + Vite + TypeScript network rack workspace with saved MDF/IDF locations. The default view shows IDF-01 / Building A, two 42U racks, and selected cross-rack connection CR-0018: CAB-A01 / PP-A04 / Port 18 → CAB-A02 / SW-B01 / Port 18 on VLAN 30.

## Run locally

Use Node.js 22.12+ or 24 LTS.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5187**. This dedicated port avoids the other local project on Vite's usual port. The command fails visibly if that port is already occupied.

```sh
npm run build
npm run preview
```

`build` checks TypeScript, regenerates the static rack fallback, and produces `dist/`. No API, credentials, or external font service is required. Inter is bundled locally under its included open font license.

## Working interactions

- [x] Two 42U racks with 20 × 24-port patch panels and 5 × 48-port switches each: 1,440 selectable ports.
- [x] Consistent patch-panel positions U42–U23 and switch positions U22–U18; numbered blanking panels below.
- [x] Single rack and Multiple racks views; add template racks and choose which racks to show side by side.
- [x] Zoom and fit. Initial desktop framing emphasizes installed equipment; scroll the rack canvas or use Fit to see all 42U.
- [x] Cable visibility, VLAN colors, and multi-select VLAN/location filters with independent port outlines.
- [x] Port/cable selection synchronized with the inspector, plus a larger keyboard/touch port grid.
- [x] Connection search, animated tracing, route diagram, creation, editing, and removal.
- [x] Reject occupied ports, invalid endpoints, and self-connections.
- [x] Switch-port VLAN assignments inherited by connected patch-panel ports, cable VLANs, and physical cable jacket colors.
- [x] Metric uses meters throughout. Standard / US uses feet for cable estimates, recommended stock lengths, and length breakdowns; calibration and stock editing use inches. The unit preference is remembered in this browser.
- [x] Example physical calibration, segment breakdown, and stock-length rounding independent of SVG scale.
- [x] Configuration pages for VLAN names/colors and available cable lengths; saved in this browser.
- [x] MDF/IDF location creation, editing, switching, archive/restore, and project export/import.
- [x] Automatic browser-local project saving includes racks, cables, port VLANs, physical calibration, and shared configuration.
- [x] Responsive layout, native modal focus handling, reduced-motion support, visible render errors, and a static SVG if JavaScript is unavailable.

Choose **Length units** in the connection inspector or **Length calibration**. Switching units converts the same physical measurements and stocked cable sizes; it does not change the stock inventory. Calibration entries accept the selected unit. Exported measurements remain in meters, with the display choice included in `preferences.lengthUnit`. Reset demo preserves that preference.

## Distribution Frames and saved projects

Open **Distribution Frames** to create an MDF or IDF with a name, building, floor, room, and notes. Each project represents one site; edit its site name on this page. Enter an existing building name to reuse it or a new name to add a building. Distribution frame names must be unique within a building. Internal location and building IDs remain stable when display names change.

A new distribution frame starts empty or copies another location’s racks, equipment, and calibration. Copies have no cables, port VLAN assignments, or port details. Use **Open racks** or the **Active distribution frame** selector above the rack view to switch closets. Each distribution frame has its own racks, cables, port assignments, spacing, and calibration; VLAN definitions, facility locations, stock sizes, and length units are shared across the site. Rack/equipment IDs are scoped to their distribution frame, so repeated labels in separate closets remain independent.

Each MDF/IDF can have an optional **Port prefix** in its Add/Edit dialog. Facility ports assigned to that frame display the prefix before their patch-panel port number (for example, `B` + `225` → `B225`). Changing the prefix updates displayed facility labels while retaining the port mappings and original labels.

Empty distribution frames offer **Add template rack**. Additional racks can be added in the **Multiple racks** view. When adding a rack, choose its height from 1–100U. Empty racks support the full range; the standard equipment template requires at least 25U for its 20 patch panels and five switches.

**Remove rack** above the rack drawing opens a rack selector and deletion preview. Confirm with **Delete rack** to remove that rack’s equipment, cables (including connections to other racks), port VLAN assignments, and port details. Port assignments and notes on remaining racks are preserved, as are all other MDF/IDF distribution frames. Removing the last rack leaves an empty distribution frame. Remaining racks retain their physical positions; newly added racks are placed after them. Deletion is saved automatically.

**Archive** hides a distribution frame from the switcher and preserves all its data. Enable **Show archived distribution frames** to restore it. At least one distribution frame stays active. Archiving the current distribution frame opens another active distribution frame. Archived port and cable assignments still protect their VLAN definitions from removal.

Projects save automatically in this browser under `porttracker.project`, including cable and port edits and physical calibration. Refreshing restores the active location. This is local storage, not a shared server or cross-device sync. The first launch migrates existing VLAN/stock settings and unit preferences; the old session-only layout can be restored from its JSON export if available.

Use **Export** or **Export project** from either the rack or Facility view for one complete JSON backup. It includes all distribution frames (including archived ones), racks, equipment, connections, port assignments/notes, configuration, custom templates and source YAML/images, saved preferences, and the facility drawing with its background, original uploaded file, layers, objects/SMB links, calibration, grid, and tool defaults. **Import project** restores these together after validation and a replacement preview/confirmation. Invalid files or failed storage writes leave the active project and drawing unchanged. Files are limited to 128 MB.

Older rack-only backups and the previous single-rack export format remain supported; the preview identifies their missing drawing. To combine old separate backups, import the rack project first, then open Facility and import the old drawing JSON, then **Export project**. A drawing-only import replaces the map while keeping rack data. Temporary selection, filters, map zoom/pan, unfinished drawing gestures, open panels, and undo history are not persisted or backed up. Legacy migration keys and drawings left over from previously replaced projects are not part of the active project backup. See [Project backup coverage](docs/PROJECT_BACKUP.md).

An unreadable stored project is preserved, with autosaving suspended and recovery controls shown. Import a valid backup or explicitly choose **Start new project** to save the displayed project in its place. If browser storage is unavailable or full, edits remain usable in memory and exportable; a persistent banner explains that they have not been saved.

## Patch-panel port details

Configure rooms, areas, and outlets in **Configuration → Facility locations**, or use **Configure** on the left-side **Locations** panel. Add, rename, color, or remove entries just like VLANs. Names can contain up to 250 characters; duplicate names are rejected. Renaming updates every assigned port, including archived MDF/IDF views. Assigned locations must be cleared or reassigned before deletion. Existing free-text locations are automatically added to this list when loading an older project.

Open **Ports** and select a patch-panel port. Under **Port details**, choose its **Facility location** or **Unassigned**. Switch-port locations appear in the information card/table and inherit from the connected patch-panel port, including locations supplied by a linked SMB. Unpatched switch ports and switch-to-switch connections show Unassigned. Repatching updates the inherited location immediately; older saved switch locations are ignored. Edit **Notes** directly in the single-port card for either a patch-panel or switch port (up to 2,000 characters). Notes save automatically and belong to that individual port; they are not inherited.

**Create/Edit connection:** settings are on the right and a live suggested route diagram is on the left. **Quick entry** accepts full switch interfaces, shortened addresses such as `1/0/33`, and prefixed panel labels such as `B450`. Unique exact matches select the ports; duplicate matches require choosing the intended equipment, and occupied ports cannot be selected. **Save and add another** saves immediately, keeps the dialog open and the chosen color, and advances to the next free compatible pair on the same equipment. If no pair remains, choose new ports. **Done** closes the dialog after repeated saves. Medium, fiber connectors/mode/strands, and VLAN are derived from the selected ports. No manual medium or VLAN fields are shown; incompatible media must be corrected on the ports. Unassigned ports require no VLAN catalog entry. Choose **Cable color** from the configured palette; manage named colors under **Configuration → Cable stock → Cable colors**. Fiber-stock jacket colors are also available. Set **Default cable color** in the same configuration section; it starts as Blue and applies to new connections. Existing cables and colors explicitly chosen in the dialog keep their colors. **Patch cable needed** shows the shortest compatible configured stock length covering the calibrated route, bend allowance, and service slack, in the current length units. Fiber stock also matches connectors, mode, strands, and jacket color. Incompatible port settings or missing stock are identified before saving.

**Connection card:** the heading identifies the endpoints (for example, `ge-0/0/0 ↔ B001`). The VLAN row uses current port assignments, including panel inheritance, rather than the separate stored cable VLAN. Differing endpoint VLANs are listed as From and To; ports without an assignment show Unassigned.

**Rack search:** use Search above the inspector tabs to find equipment, ports, or connections in the active distribution frame. Search accepts equipment names/IDs, prefixed panel ports such as B001, switch interfaces such as 0/0/0, locations, notes, and connection IDs. Select a result (or press Enter for the first result) to open its inspector and bring it into view. Search clears filters that would hide the result and reveals its rack; connection results also show the cable. Escape or Clear rack search clears the query.

**Port inspector:** one selected port shows an information card with its frame, rack, connection, VLAN, media, patch location and notes. Multiple selected ports show a table containing only the selection; notes appear only in the single-port card. Switch ports display their mapped interface address (such as `0/0/0`) and their connected panel port (such as `B001`). Patch location comes from the linked panel port and follows its location changes; unpatched switch ports show Unassigned. Remove a table row to deselect that port, or use **Clear selection** beside the selected-ports heading to clear the selection. The card/table follows the number selected, including a single port in multi-select mode. Use **Choose ports** to open the port grid and **Done choosing ports** to return to the compact inspector. Rack clicks and drag selection open the card/table directly.

**Bulk details:** Shift-click ports or drag a selection box, then use **Location for selected ports**. Keep existing locations, choose a shared location from the list, or clear the assignments. Notes are edited only in the single-port card. Click **Apply details** to save the chosen location changes. Unchanged fields retain each port’s individual values. Changing the selected ports or device resets pending detail edits.

**View filters:** the left-side panel contains full-length, collapsible **VLANs** and **Locations** checkbox lists without internal scrollbars. **Select all** at the top checks both lists; each list also has its own **Select all** and **Clear** controls. **Cables** and **VLAN colors** switches are above the accordions. Collapsing a list preserves its checks. **Unassigned** is available in each list.

With **VLAN colors** enabled, rack cables, their endpoints, the path preview, and cable VLAN filters follow the connected switch port's current VLAN immediately, including after bulk edits or reloading. They use the configured VLAN color rather than the cable's saved VLAN. Unassigned connections and links between switches with different VLANs use neutral gray. Turning **VLAN colors** off shows the saved physical jacket color.

Matches use any checked VLAN **or** location. Both types of matches appear together. No selections means no assignment outlines; physical ports remain visible, and the **Cables** switch controls cable visibility. Checked VLANs draw VLAN-colored outlines and checked locations draw location-colored outlines, including on unconnected ports. Ports matching both have an inner VLAN outline and an outer location outline; the inspector uses a location-colored border and VLAN-colored bottom edge. Turning off **VLAN colors** hides VLAN outlines but preserves location outlines. **Clear filters** clears all assignment highlights.

Counts show assigned ports in the active MDF/IDF; configuration usage includes all views. Port filtering uses port VLAN assignments; cable filtering uses cable VLANs or a selected location at either endpoint. The selected cable’s path diagram and trace remain available without a Cable paths switch.

Patch-panel details work with or without a cable and stay on the panel port when connections or VLANs change. Bulk location edits apply only to selected patch-panel ports without a map-controlled location. An information marker identifies documented ports in the grid; the grid and rack tooltips include the facility location. Details are specific to that port in that MDF/IDF, survive reload and archive/restore, and are included in project backups under `locations[].layout.portDetails`. Copying an equipment layout starts with blank port details. Existing project files without port details remain supported.

## Port VLANs

Open **Ports**, select a switch port, then use **Port VLAN** to assign, change, or clear its VLAN. Patch-panel ports inherit the VLAN of their directly connected switch port and show it in the information card/table. The VLAN editing section appears only for switches; the location editing section appears only for patch panels. Notes are edited in the single-port card for either kind of port. Bulk selections follow the same rule, with mixed selections showing controls for the applicable ports. A panel port is Unassigned when disconnected, connected to another panel, or connected to a switch port without a VLAN. Repatching and switch VLAN changes update the panel immediately. Check the desired VLANs in **View filters → VLANs** to show their colored port outlines and grid edges, even with cables hidden. The grid dot indicates a cable connection.

**Bulk assignment:** drag a box directly over ports in the rack drawing to select them and open the Ports inspector. Shift-drag adds to the selection; Escape cancels. Selection uses socket centers and follows the current zoom. Selections can span equipment and racks within the current distribution frame; each table row identifies its equipment and rack. On touch screens, open the **Ports** tab before dragging a selection box. Click a rack port for a single selection; Shift-click adds a range on the same device, and Ctrl/Cmd-click toggles individual ports across devices. The inspector starts with the selected port card or table; rack/equipment browsing selectors and the multiple-selection checkbox are omitted. **Choose ports** opens the current device’s grid, where you can also extend a multiple selection. Choose **VLAN for selected ports** (or **Unassigned — clear VLAN**), then click **Apply**. The current VLAN summary includes every selected port. Bulk changes apply only to selected switch ports; panel ports follow their connected switch ports. Switching equipment or racks keeps the selection. With two available ports selected, choose **Connect selected ports** to open a connection with those exact endpoints, including switch-to-switch links. Review and save it in the connection dialog.

Switch-port assignments are independent of cable VLANs: changing or removing a cable preserves the switch assignment. Panel VLANs are derived from the connection; old panel assignments in saved projects are ignored. Connections derive VLAN from their switch ports when saved; an unassigned port or differing switch assignments leave the cable record without a single VLAN. The connection card always shows the live endpoint assignments. Demo ports start with assignments matching their sample cables. Changes are saved with the active location and included in project export under `locations[].layout.portVlans`. Reset demo restores only the starting IDF after confirmation; it preserves other locations and shared configuration.

## Rack size and side management

Equipment placement and move dialogs include a **Rack position preview** beside the destination controls. It lists all rack units from highest to lowest, identifies installed equipment and free units, and highlights the full proposed equipment span. Click a unit to set the bottom position. Conflicts are marked in red; moving equipment is excluded from occupancy in its current rack. For batches, this preview shows the first device; the batch preview reviews every placement.

Use **Add empty rack** or **Add template rack** to choose rack height and whether vertical cable managers are present on both sides. **Rack settings** edits these options for an existing rack; rack height cannot shrink below installed equipment. Racks without managers draw narrower while preserving equipment and port alignment.

In **Length calibration**, rack width measures the outer frame and equipment width measures the centered equipment face (normally 19 inches). **Side manager width (each)** and **Manager overlap on rack (each)** determine how far managers extend outside that frame. For example, a 23-inch rack with 5-inch managers overlapping 1 inch on each side occupies 31 inches overall. The gap is clear space between the outermost edges of adjacent rack assemblies. Manager routing uses the manager centerline. The breakdown separates port-to-rack-edge travel, side-manager access, managed vertical runs, and unmanaged vertical runs. Racks without managers use a side route with no manager width or overlap contribution. The tray is above the tallest rack. Older projects retain their previous geometry until the explicit measurements are applied.

## Patch-panel batches

When adding a patch-panel template, set **Quantity** and **Starting port number**. For multiple panels, choose **Preview patch panels**, review each panel's name, rack, bottom unit, and port range, then choose **Create patch panels**. Nine 48-port panels starting at 1 receive ranges 1–48, 49–96, through 385–432. Placement fills free space below the first panel, skipping occupied units; a position of 0 requires correction. Creation is all-or-nothing. Numbering applies to the actual port records; printed numbers in template images remain unchanged.

## Switch stacks / Virtual Chassis

Generated switch names use the equipment label followed by the member number: for example, label `BBY01320N023` and starting member 1 produce `BBY01320N023-1`, `BBY01320N023-2`, and so on. Entering the first name as `BBY01320N023-1` produces the same sequence. Preview names remain editable.

In the main **Racks → Equipment** inspector, choose **Add equipment from template**, select a switch template, and set **Stack membership → Create a stack**. Enter the stack name, optional management address, interface naming mode, total number of members (including the first switch), and starting member number. Pick the first switch’s rack and bottom unit, then choose **Preview stack**.

The preview fills free rack space below the first switch, skipping occupied units. Every row can change its member number, switch name, switch template, rack, and bottom unit. A position of **0** flags insufficient space; choose a free position or another rack. Multi-unit and mixed-template members are supported in the records. Review the first interface names, then choose **Create stack**. All switches are created together; invalid or overlapping placements, duplicate member numbers, and duplicate stack names block the entire operation. New members have no copied cables, VLAN assignments, locations, or notes. Changing the initial placement or member count requires a new preview; **Regenerate placement** discards manual row adjustments.

To add one more switch later, choose **Join [stack name]** when placing equipment. PortTracker suggests the lowest unused member number. To group or renumber existing switches, select a switch under **Equipment** and click **Stack / Virtual Chassis**. Choose an existing stack, create a group for that switch, or choose **Standalone** to remove membership. The editor also updates the shared stack name, management address, and naming mode. These are PortTracker records; they do not configure the physical switches or check model-specific stacking compatibility.

Stacks belong to a distribution frame and may span its racks. Only switches can be members, and member numbers must be unique within a stack. Juniper naming substitutes the member number in mapped `ge-`, `xe-`, `et-`, and `mge-` interface names, preserving the PIC, port, breakout channel, and logical unit. For example, member 2 maps `ge-0/0/23` to `ge-2/0/23`. Cisco StackWise naming substitutes the first number in mapped Fast Ethernet, Gigabit, Ten Gigabit, Twenty-Five Gigabit, Forty Gigabit, and Hundred Gigabit interface names while preserving the slot, port, breakout channel, and logical unit. For example, member 2 maps `GigabitEthernet1/0/1` to `GigabitEthernet2/0/1`. Unrecognized names stay unchanged; **Keep template interface names** disables substitution. Port numbering, socket maps, and the original template names are preserved. Renumbering, leaving a stack, and moving a member retain its physical port assignments and connections. The application accepts member numbers 0–255 and batch creation of 1–100 members; use numbers and counts supported by the actual switch models.

Stack membership survives project save/export/import, archiving, and copying a distribution frame’s equipment layout. Removing equipment or racks, or changing membership, removes groups left without members and frees their names. Names held by empty groups in older projects can also be reused when creating a stack. If a name belongs to an active stack, the error identifies its rack and switch members. The Data view tables include stack filters and member/interface information. The Ports table keeps **Source interface** (the original template name) separate from the effective **Interface name**, and CSV exports include both.

## Data view

Open **Data view** in the top navigation for **Racks**, **Ports**, and **Connections** tabs. Each tab starts with the active distribution frame; choose **All distribution frames** to compare the site, and optionally include archived frames. Each tab retains its own filters, sorting, and page while switching tabs. Use arrow keys, Home, or End to move between tabs. Click a column heading to sort; use the pagination controls for larger results.

- **Racks:** one row per piece of equipment, grouped by rack by default, plus a row for every empty rack. Includes rack occupancy, equipment type, rack-unit position, height, custom port range, total/connected ports, and template. Filter by rack or equipment type.
- **Ports:** every port on every piece of equipment, including unconnected ports. Includes custom numbering (including port 0), mapped source-interface names, physical media, connection status and the other endpoint, independent port VLAN, facility location, and notes. Filter by rack, equipment, port VLAN (including Unassigned), or connection status. Search also matches locations and notes.
- **Connections:** the original connections table. Filter by rack (either endpoint), cable VLAN, or cable type. Search includes equipment and rack names, port numbers, endpoint VLANs, facility locations, and port notes.

The Connections table shows custom rack names, both endpoints and their independent port VLANs, cable VLAN, copper/fiber details, jacket color, route, locations, notes, and estimated/recommended lengths. Lengths use each frame’s calibration and the current shared cable stock, including fiber compatibility. Standard lengths display in feet; metric lengths display in meters. These remain illustrative estimates.

Each tab’s **Export CSV** downloads every filtered row in the current sort order, including rows on other pages, to `porttracker-racks.csv`, `porttracker-ports.csv`, or `porttracker-connections.csv`. Connection endpoints have separate rack, equipment, port, VLAN, location, and notes columns in the CSV. Multiline notes and quotes are preserved; text that could be interpreted as a spreadsheet formula is prefixed with an apostrophe. The tables are read-only; edit equipment, connections, and port data in the main **Racks** view. The header’s existing **Export** button still downloads the full project JSON backup.

## Equipment images

Use **Add equipment from template** in the Equipment inspector to place equipment with an image and mapped ports. These templates are bundled locally:

- **Generic 24-port copper patch panel**: ports 1–24 left to right; 1–12 use the left manager and 13–24 the right.
- **Ubiquiti US-48**: 48 copper ports, with odd numbers on top and even numbers below. Ports 1–24 use the left manager and 25–48 the right. Its four pictured SFP/SFP+ uplinks are decorative in this milestone and cannot be selected or connected.

Existing equipment retains its assigned image or original SVG face. Template assignments are saved, exported/imported, and copied with equipment layouts. Unknown or incompatible template IDs are rejected during import.

Rack rows use a shared scale for 19-inch faces and 1.75-inch units. Equipment images keep their original aspect ratio, centered within the face without stretching or cropping. Clickable sockets and highlights use measured image-relative bounds within that fitted image. Cable endpoints, manager choices, and the path preview follow the selected face. Length estimates use mapped socket proportions within the calibrated equipment width; older projects without that measurement retain the previous 80%-of-rack approximation until calibration is applied. Image pixels are not treated as meters. These estimates still require field verification. Missing images fall back to interactive socket rectangles at the mapped positions.

Images and matching device definitions are unmodified files from the [NetBox Device Type Library](https://github.com/netbox-community/devicetype-library), pinned to revision `ee2d47348a52427de652bc29a5dee72de08801ea`. Source URLs and SHA-256 checksums are in `public/equipment/netbox/sources.json`; the upstream CC0 license is included as `LICENSE.txt`. CC0 does not grant trademark rights. The app needs no NetBox server or external image requests. `src/equipmentTemplates.ts` contains the socket maps and compatibility rules for adding more verified models later.

## Importing equipment templates

Open **Configuration → Equipment templates → Import template**.

Use the optional **Rear image** upload when importing or editing a custom template. Rear images retain their proportions and are included in project backups. Move rear ports to Front before removing their rear image. Replacing an image keeps mapped positions; review them against the replacement image. Both faces and retained YAML count toward the shared 4 MB embedded-data limit.

The rack toolbar’s **Front / Rear** toggle switches faces and persists with the project. Rear view reverses the left-to-right rack order and shows rear equipment images at the same rack units, with a labeled fallback for missing images. Equipment can still be selected and moved, including the existing warning for connected equipment. Each face shows only its assigned ports and cables. Ports support the same selection, VLAN, location, and connection controls on either face. Selecting a port opens its assigned face. Cables between faces show a “To Front” or “To Rear” continuation at the manager; selecting that cable keeps the current face. Cable estimates use physical left/right sides (viewed from Front); front-to-rear estimates currently exclude rack depth, which is called out in the connection screens.

1. Choose a NetBox device-definition `.yaml`/`.yml` file and its matching front image (PNG, JPEG, or WebP).
2. Review the manufacturer, model, rack height, equipment type, and included interfaces. Copper and console interfaces are selected by default when copper is present; include uplinks and rear network sockets you want to map. Patch panels use `front-ports`; switches use `interfaces` and `console-ports`. Network and console ports can be assigned to either face. Patch-panel rear terminations, power, and other unsupported YAML components are retained in the original source but do not become active app components. Missing Ethernet and serial console ports can be added manually.
3. Continue to mapping. Switches use their source interface names as display labels: `mgmt` becomes **MGMT**, `port1` becomes **1**, and names such as `ge-0/0/0` remain intact. An optional **Port label** overrides the display name without changing source interfaces, connection identities, VLANs, notes, or socket positions. Leave it blank to restore the source label. Labels must be unique within a template. Switch range selectors show labels, so named ports do not shift the physical numbering. For patch panels, set **Starting port number** to the first number in the desired range: 0 gives 0–23, 1 gives 1–24, and 25 gives 25–48 for a 24-port panel. The mapped-port selector and image markers use this numbering. New equipment inherits it; changing a saved template’s starting number also renumbers devices following that template across all locations, preserving connections, VLANs, and notes on the same physical sockets. Select a port and click the socket center, or generate a regular grid with row or column numbering. Adjust centers and socket dimensions as percentages of the original image. Under **Start with a regular grid**, select a range or check individual ports, adjust the grid, and choose **Generate port grid**. Only selected ports are updated. Repeat with another group or use **Select unmapped ports** for the remaining sockets. Drag directly on the image to draw a selection box around positioned sockets or visible grid previews; a mouse drag automatically enables **Drag select**. On touch screens, choose **Drag select** first. In this mode, you can also drag across the port list to select unmapped ports. Shift-drag or **Add to selection** keeps the current image selection. Dragging from a checked list entry clears the visited entries. Escape cancels a drag; **Place ports** restores click-to-position mapping. The image stays pinned above the controls, with dashed purple boxes showing the grid preview until it is applied. **Include more ports** returns to the interface list; continuing preserves existing positions by source interface. Source interfaces can be swapped between numbered slots before the first save.
4. For a rear network port, add a rear image, choose the **Mapped port**, set **Port face → Rear**, and click its socket center. Changing a port’s face clears its old position but preserves its number, source interface, and existing equipment connections. For a group, display **Rear**, select ports in the grid list or range, and generate the grid; only those ports move to Rear. Clear-all and image marquee selection apply to the displayed face. Identical coordinates on different faces are allowed.
5. Review every mapped position and number, check the review box, and save. Unmapped, out-of-bounds, or overlapping sockets are rejected.
6. Choose **Place in rack** to add equipment using the template. The first mapped slot attaches to the device’s starting port number; names are not used to infer connections.

Use **Add port** beside the mapping controls for a port missing from the YAML. Enter its label, choose **Ethernet / network** or **Serial console**, select the connector or physical type, and choose Front or Rear. Rear requires a rear image. Click **Add port to template**, place the socket on the image, review, and save. Unsaved additions can be removed with **Remove added port**. Console connector choices include RJ45, USB variants, DB9/DB25, and Other.

New ports are appended to every device using the template, including devices with a numbering override. Existing port identities, cables, VLANs, notes, and media overrides are preserved. Used templates cannot remove or reorder existing ports. Console ports can be selected, labeled, and documented, but are excluded from Ethernet/fiber connection creation and VLAN assignments. Serial console cabling is not supported yet. Their connector can be edited in the template.

The library supports whole rack heights from 1–42U and 1–256 mapped ports. Use **Place in rack** to create equipment with the selected template’s height and port count, including mapped uplinks. Excluded ports are decorative. Images retain their aspect ratio and mapped socket bounds drive highlights and cable attachment positions.

Custom templates can be edited and reused across locations, including copied layouts. Editing positions updates all devices using that template; existing numbered source identities cannot be changed on a used template. Removal is disabled while any device uses the template, including archived locations.

Images are embedded once in the project-level `templates` catalog along with manufacturer/model, source filename and original YAML when available, interface names/types, and normalized socket bounds. They work offline and travel with normal project export/import. Existing projects without a catalog still load. Runtime layouts receive the catalog through `projectLayout`; it is not duplicated inside saved locations. Project imports validate all custom template references and maps before replacement.

Each template card offers **Export template**, which downloads a portable JSON package with front/rear images, port maps, physical settings, and original source YAML when available. Use **Import saved template** to add a separate editable copy; existing templates and installed equipment are unchanged. Bundled templates can also be exported. Package files are limited to 8 MB and must fit the project catalog limits below.

New YAML imports preserve the original source, including comments and fields the app does not yet use. **Source YAML** downloads that original file; mapper edits are saved separately. For older templates, **Edit template → Source YAML → Attach source YAML** can retain a matching original file without altering existing ports. Previously discarded source cannot be reconstructed automatically. Attaching source does not add its missing ports; use **Add port** or create a new template import.

See [Template storage and backend design](docs/TEMPLATE_STORAGE.md) for the package format and recommended PostgreSQL, object storage, stable port IDs, and template revision model. The backend implements relational storage, file assets, and template revisions; browser-only mode remains available.

Limits: 512 KB per YAML file, 1 MB per image, 8192 pixels per side / 32 megapixels, 30 custom templates, and 4 MB total encoded image data plus retained source YAML. Browser storage can impose a lower limit; the existing storage notice and project export remain available if saving fails. SVG files, YAML aliases, duplicate keys/names, and malformed definitions are rejected. Images are not automatically downloaded, and the app does not require a NetBox server.

## Placing, moving, and removing equipment

Use **Rename rack** above the rack drawing to choose a rack and give it a name (up to 100 characters). Names are saved with the project and included in backups; rack IDs, equipment, and connections remain intact. Long names are shortened on the drawing, with the full name available on hover.

The inspector has **Equipment**, **Ports**, and **Connections** tabs. Equipment manages installed devices; Ports manages individual ports and bulk assignments; Connections shows the selected cable’s details, route, estimates, and actions. Select a cable in the rack, or choose a connected port and use **View connection**.

Use **Equipment → Add equipment from template**, **Add equipment** above the rack drawing, or **Place in rack** on a template card. Choose the destination rack, a stable equipment ID, a label, and the **bottom rack unit**. A 2U device at U16 occupies U16–U17. Patch-panel numbering is inherited from the template’s **Starting port number** setting in **Configuration → Equipment templates → Edit template**. Switches display interface names or custom port labels; their saved numeric connection keys remain unchanged. The placement dialog shows the inherited range. Existing devices without the setting continue to start at 1. Numbering is preserved in connections, VLANs, notes, moves, copied layouts, and backups. Template socket order and source interface names stay intact; image pixels are not relabeled. Placement checks the entire occupied span and rejects overlap, fractional units, and positions outside the destination rack. **Add empty rack** creates a blank rack; **Add template rack** supplies the original demo equipment positioned relative to the top of the chosen rack.

The rack drawing uses each device’s full height and shows blank panels only in unoccupied units. Image proportions, socket overlays, and cable attachment points share the fitted image bounds. Port counts are dynamic throughout the port inspector, bulk VLANs/notes, connection picker, and generic SVG fallback. To use SFP/SFP+ or other uplinks, include and map them when importing the device; the original bundled US-48 appearance still models its 48 copper ports only. Cable records document connectivity and estimated path length, not transceiver/media compatibility.

In **Equipment**, select a device directly on the rack or from **Manage** to show its selection outline. Drag its face to move it within the rack. The preview snaps to whole rack units, includes the device’s full height, and turns red for occupied or out-of-bounds positions. Release over a valid position to save; Escape cancels. Equipment with cable connections requires confirmation before a drag move or a move from the position dialog is saved. The warning shows the connection count and old/new rack positions. Cancel leaves the equipment and its data unchanged; unconnected equipment moves without this warning. Mouse and touch dragging preserve zoom, IDs, port numbers, notes, locations, VLANs and cable connections. Switch to **Ports** for port selection. **Move equipment** remains available for precise unit entry or moving to another rack within the active location; its preview lists affected connections. A destination cannot contain another device with the same ID. Use **Remove equipment** to remove a device.

Removal previews connections, VLAN assignments, and documented ports before **Delete equipment**. It removes only that device’s records and its incident cables; the other endpoints’ VLANs and notes are retained. Removing the last device leaves a valid empty rack. New placements, moves, and removals are saved and included in project backups; imports validate complete unit occupancy and template compatibility. Existing projects and copied layouts retain their data.

## Cable routing

Adjacent racks touch edge-to-edge in the elevation and path preview. Display spacing is independent of the physical rack spacing used in length calibration.

Every endpoint uses the manager on its own half of the equipment. With Original SVG, a 24-port panel routes ports 1–12 left and 13–24 right; the two-row 48-port switch routes ports 1–12 and 25–36 left, and ports 13–24 and 37–48 right. Image templates follow their mapped socket positions and numbering, as described above.

Cross-rack cables travel up the source side route, across the overhead tray, and down the destination side route. Where a rack has vertical managers, the route uses them; otherwise it follows the rack side. Same-rack cables between opposite halves also use the tray; endpoints on the same half share the vertical side route. The rack drawing, path preview, inspector, and physical length calculation use the same routing decisions.

## Configuration pages

Open **Configuration** in the header, or use **Configure** beside the VLAN legend and the **Stock length** link in the connection inspector.

- **VLAN list** (`/#/configuration/vlans`): search, add IDs from 1–4094, rename, recolor, and remove unused VLANs. IDs remain fixed after creation. Colors and names update the legend, filters, port and cable overlays, path diagram, and connection editor immediately. VLANs assigned to ports or connections in any location, including archived locations, cannot be removed; the table shows both project-wide usage counts.
- **Cable stock** (`/#/configuration/stock`): add, edit, and remove available cable sizes in meters or inches. Recommendations choose the shortest configured size that covers the full estimate. The list tracks sizes, not inventory quantities. Empty or insufficient stock displays **No stock match**.

Configuration belongs to the project’s site and is shared by its locations. Failed saves show a visible warning; Export includes the current in-memory changes. Reset demo preserves VLANs, cable stock, and unit preference; sample connections only return when their VLAN is still configured.

## Source layout

- `src/project.ts`: versioned project model, location operations, validation, legacy migration, and browser storage.
- `src/components/LocationsPage.tsx`: location management and project import preview.
- `src/configuration.ts`: shared configuration validation and legacy settings migration.
- `src/components/ConfigurationPages.tsx`: VLAN and cable-stock configuration pages.
- `src/model.ts`: editable fixtures, validation, physical measurements, and routing-side decisions.
- `src/geometry.ts`: SVG geometry and rounded cable paths, separate from physical calculations.
- `src/components/`: rack/equipment rendering, endpoint picker, connection editor, and path diagram.
- `src/App.tsx`: workspace controls and inspector state.
- `src/styles.css`: desktop and narrow-screen styles.
- `scripts/render-fallback.tsx`: generates `public/rack-fallback.svg` from the same React equipment components.
- `reference/`: the two original reference images.
- `prototype/` and `starter/`: original handoff code, retained for reference; not used by the new app.
- `docs/FUTURE_PHASES.md`: deferred backend, mobile, and offline requirements.
- `archive/`: the original ZIP. Misnamed loose duplicates were removed.
- `artifacts/`: rendered desktop/mobile screenshots and visual comparison.

## Validation

```sh
npm test
npx playwright install chromium
npm run test:ui
```

The model cases cover rack positions, port counts, both routing directions, port-half routing on panels and both switch rows, same-side and opposite-side same-rack routing, length calibration, stock rounding, occupied-port rejection, and additional racks. Browser tests cover desktop controls, create/edit/delete, filtering, bulk port selection, location isolation, reload persistence, archive/restore, import/export, storage recovery, mobile overflow, and console/runtime errors. Playwright uses its own server on port 5188 so it can run while the development server remains open on port 5187.

On minimal Linux systems, Chromium requires its usual system libraries. This workspace was tested with its browser and extracted libraries isolated in `/tmp`:

```sh
LD_LIBRARY_PATH=/tmp/porttracker-browser-libs/extracted/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BROWSERS_PATH=/tmp/porttracker-browsers npm run test:ui
```

## Visual and functional limits

The page follows the approved dark header, light side panels, paired racks, overhead pathway, and populated connection inspector. It is **not pixel-perfect**: SVG equipment is cleaner and less photorealistic, the demo contains 32 actual cables, and the starting demo layout leaves 17U free below the switches, which can now be populated from templates. The target mockup's inconsistent row numbering and illustrative counts are not copied. Secondary inspector controls scroll on short desktop viewports.

Length results remain illustrative, including after editing example calibration. They use the rack width, rack spacing, U height, an example port-field width, tray rise, entry/bend allowance, and slack. They do not replace measured equipment templates or a field survey. Local mode persists projects in the browser. Server mode persists projects in PostgreSQL and server-managed asset storage with authenticated access across browsers. Live network discovery and Android builds are not implemented. MDF–IDF uplinks and measured inter-location pathways remain future work; current routing is within a location.

## Fiber ports and cables

Equipment templates can mix copper ports, fiber panel ports, and SFP/SFP+/SFP28/QSFP/QSFP28 slots. In **Equipment templates → Edit template**, configure the physical type for each mapped port, or apply that type to all ports. New YAML imports recognize common optical slot and LC/SC/ST/MPO front-port types; review the inferred types and include uplinks explicitly. Clearing or regenerating socket positions preserves the physical settings. Existing templates without physical metadata retain copper behavior.

For installed equipment, open **Ports → Physical port settings**. Record the connector, single-mode or multimode fiber, strand count, and an installed transceiver model for optical slots. Multi-select ports to apply the same settings in bulk. The displayed first port supplies the draft for a bulk edit; applying replaces the physical settings on all selected ports. RJ45 transceivers can be recorded in optical slots for copper connections. An empty slot can be documented, but connecting it requires its installed transceiver and connector.

In **Create/Edit connection**, choose Copper or Fiber. Fiber records the connectors at both ends, mode, strand count, and jacket color. A duplex pair is one connection with two strands. The app rejects incompatible media, connectors, modes, and strand counts; bulk changes and template edits cannot invalidate existing connections. Transceiver model text is documentation: optical power budgets, wavelength, speed, connector polish, MPO polarity, breakouts, splices, and individual strands are not modeled. Routing and estimated lengths use the existing calibrated rack pathways, with the same allowances; there is no separate fiber bend-radius model.

Under **Configuration → Cable stock**, copper lengths and fiber stock are separate. Fiber stock records length, mode, connectors, strand count, and jacket color. Recommendations select the shortest matching fiber cable long enough for the estimated route, accepting reversed connector ends. Stock quantities are not tracked. Metric/standard display works for both categories. VLAN overlay colors remain separate from physical cable colors and port media.

Physical settings follow equipment moves and template renumbering, are included when copying an equipment layout, and are removed with the relevant port/device/rack. Templates, overrides, transceivers, fiber connections, and fiber stock are included in normal project backups.

Only custom rack names appear in the drawing, selectors, menus, tooltips, and connection details. Internal rack IDs remain stable in saved projects and backups, but are not displayed. Connection search matches rack names.

Single-rack view defaults to filling the available canvas width, with vertical scrolling for the rest of the rack. It follows viewport size changes until you choose a zoom. Pinch on a touchpad (or Ctrl+scroll) over the rack workspace to zoom the racks around the pointer without zooming the page. Two-finger scrolling still pans the workspace. **Zoom in**, **Zoom out**, pinch gestures, and **Fit** save a separate zoom for single-rack and multiple-rack views. Each saved zoom survives edits, switching views, navigation, reloads, and project backups. **Fit** shows the full rack height and computes its scale once; it does not keep resizing after edits. Existing multiple-rack zoom settings are preserved.

For an individual installed panel, open **Equipment → Port numbering**, enter its starting number, and choose **Save port range**. This creates a device-specific range, so identical panel models can use different numbers. **Use template range** restores inheritance. Template edits keep device-specific ranges. All range changes preserve the socket positions, cable endpoints, VLANs, notes, and fiber settings, as well as the current zoom. Starting numbers must be nonnegative whole numbers, with the last port at or below 999999. Source interface names and labels printed in images are unchanged.

## Facility floor plans

Choose **Facility** in the top navigation to open the single-floor plan editor. Draw rooms, place outlets and devices, edit cable paths, manage layers and calibrate measurements. Drawings autosave in IndexedDB, and **Export project** backs them up together with the rack data. **Import project** accepts unified backups and older drawing-only JSON files. See [the Facility guide](docs/FACILITY_EDITOR.md) for usage, file support, shortcuts and scope.
