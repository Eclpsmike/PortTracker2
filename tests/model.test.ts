import { migrateFacilityLocations, assignPortLocations, saveFacilityLocation, removeFacilityLocation, facilityLocationUsage, cableAtLocation } from '../src/facilityLocations';
import { connectionRows, connectionsCsv } from '../src/connectionData';
import { inventoryRows } from '../src/inventoryData';
import { stackProject } from './stack-fixture';
import { planPatchPanels, createPatchPanels } from '../src/patchPanels';
import { assertStackLayout, createStackEquipment, nextStackMember, planStackMembers, saveStack, setEquipmentStack } from '../src/stacks';
import { interfaceName, positionRacks, rackFootprint, type SwitchStack } from '../src/model';
import { firstPortNumber, portNumbers } from '../src/model';
import { templatePort } from '../src/equipmentTemplates';
import { addEquipment, moveEquipment, removeEquipment, equipmentRemovalImpact, placementError, firstFreeUnit, equipmentTopU } from '../src/model';
import { readFileSync } from 'node:fs';
import { parseDeviceDefinition, validCustomTemplates, gridPorts } from '../src/templateImport';
import { projectLayout, saveEquipmentTemplate, removeEquipmentTemplate, templateUsage } from '../src/project';
import type { EquipmentTemplate } from '../src/equipmentTemplates';
import { EQUIPMENT_TEMPLATES } from '../src/equipmentTemplates';
import test from 'node:test';
import { defaultConfiguration, parseConfiguration, vlanError, vlanRemovalError, stockLengthError } from '../src/configuration';
import { fromMeters, toMeters, formatLengthValue } from '../src/units';
import assert from 'node:assert/strict';
import { fixtureLayout, makeRack, defaultCalibration, estimateCable, connectionError, resolveEndpoint, routeSides, endpointSide, cableRoute, assignPortVlan, assignPortVlans, portVlan, endpointKey, patchPortDetails, setPatchPortDetails, updatePatchPortsDetails, removeRack, rackRemovalImpact, setEquipmentTemplate, PORT_LOCATION_MAX, PORT_NOTES_MAX } from '../src/model';
import { cablePoints, roundedPath, rackX, rackTop, RACK_WIDTH, portPoint, portSize, EQUIPMENT_FACE, equipmentImageBounds, sceneSize, equipmentFace, TOP, UNIT } from '../src/geometry';
test('mixed-height racks share a floor and cable endpoints follow their shifted ports', () => {
  const layout = fixtureLayout();
  layout.racks[1].heightU = 48;
  const ids = layout.racks.map(r => r.id);
  const floors = layout.racks.map(r => rackTop(layout, r.id, ids) + r.heightU * UNIT);
  assert.ok(Math.abs(floors[0] - floors[1]) < 1e-9);
  const cable = layout.cables[0];
  const single = portPoint(layout, cable.from, [cable.from.rackId]);
  const multi = portPoint(layout, cable.from, ids);
  assert.ok(Math.abs(multi.y - single.y - 6 * UNIT) < 1e-9);
  const points = cablePoints(layout, cable, ids);
  assert.deepEqual(points[0], multi);
  assert.deepEqual(points.at(-1), portPoint(layout, cable.to, ids));
  assert.equal(rackTop(layout, ids[0], [ids[0]]), TOP);
});
test('fixture has exactly 1,440 valid unique ports and the approved cross-rack connection', () => {
  const layout = fixtureLayout();
  assert.equal(layout.racks.reduce((n, r) => n + r.equipment.reduce((n, e) => n + e.portCount, 0), 0), 1440);
  for (const r of layout.racks) {
    assert.deepEqual(r.equipment.slice(0, 20).map(e => e.bottomU), Array.from({ length: 20 }, (_, i) => 42 - i));
    assert.deepEqual(r.equipment.slice(20).map(e => e.bottomU), [22, 21, 20, 19, 18]);
    assert.equal(r.equipment[19].firstNumber, 457);
  }
  const c = layout.cables.find(c => c.id === 'CR-0018')!;
  assert.equal(c.from.port, 18); assert.equal(c.to.port, 18); assert.equal(c.vlan, 30);
  for (const cable of layout.cables) assert.equal(connectionError(layout, cable), null);
});

test('manager widths affect only managed racks and cable runs stay accounted for', () => {
  const layout = fixtureLayout();
  const cal = { ...defaultCalibration, verticalManagerWidthM: .1 };
  layout.racks[1].verticalManagement = false;
  layout.racks = positionRacks(layout.racks, cal, .25);
  assert.equal(rackFootprint(layout.racks[0], cal), .8);
  assert.equal(rackFootprint(layout.racks[1], cal), .6);
  assert.equal(layout.racks[1].positionM, 1.05);
  const cable = layout.cables.find(c => c.id === 'CR-0018')!;
  const mixed = estimateCable(layout, cable, cal);
  assert.equal(mixed.segments['Side manager access'], .05);
  assert.ok(mixed.segments['Managed vertical runs'] > 0);
  assert.ok(mixed.segments['Unmanaged vertical runs'] > 0);
  assert.ok(Math.abs(mixed.requiredM - estimateCable(layout, { ...cable, from: cable.to, to: cable.from }, cal).requiredM) < 1e-9);
  layout.racks[0].verticalManagement = false;
  layout.racks = positionRacks(layout.racks, cal, .25);
  const unmanaged = estimateCable(layout, cable, cal);
  assert.equal(unmanaged.segments['Side manager access'], 0);
  assert.equal(unmanaged.segments['Managed vertical runs'], 0);
  assert.equal(unmanaged.requiredM, estimateCable(layout, cable, { ...cal, verticalManagerWidthM: 0 }).requiredM);
  assert.ok(unmanaged.segments['Unmanaged vertical runs'] > 0);
  assert.throws(() => estimateCable(layout, cable, { ...cal, verticalManagerWidthM: -1 }), /Calibration/);
  const project = defaultProject(defaultConfiguration(), 'metric');
  project.locations[0].layout = layout; project.locations[0].calibration = cal;
  assert.ok(parseProject(JSON.parse(JSON.stringify(project))));
  assert.equal(parseProject({ ...project, locations: [{ ...project.locations[0], calibration: { ...cal, verticalManagerWidthM: -1 } }] }), null);
});

test('23-inch frames with 19-inch equipment account for 1-inch manager overlap', () => {
  const inch = .0254;
  const cal = { ...defaultCalibration, rackWidthM: 23 * inch, equipmentWidthM: 19 * inch, verticalManagerWidthM: 5 * inch, managerOverlapM: inch };
  const layout = fixtureLayout();
  layout.racks = positionRacks(layout.racks, cal, inch);
  assert.ok(Math.abs(rackFootprint(layout.racks[0], cal) / inch - 31) < 1e-9);
  assert.ok(Math.abs(layout.racks[1].positionM / inch - 32) < 1e-9);
  const cable = { ...layout.cables[0], from: { rackId: 'CAB-A01', equipmentId: 'SW-A01', port: 1 }, to: { rackId: 'CAB-A02', equipmentId: 'PP-B01', port: 24 } };
  const estimate = estimateCable(layout, cable, cal);
  assert.ok(Math.abs(estimate.segments['Overhead span'] / inch - 58) < 1e-9);
  assert.ok(Math.abs(estimate.segments['Side manager access'] / inch - 3) < 1e-9);
  const oldCal = { ...cal, managerOverlapM: 0 };
  const old = estimateCable({ ...layout, racks: positionRacks(layout.racks, oldCal, inch) }, cable, oldCal);
  assert.ok(Math.abs((old.requiredM - estimate.requiredM) / inch - 6) < 1e-9);
  assert.ok(Math.abs(estimate.requiredM - estimateCable(layout, { ...cable, from: cable.to, to: cable.from }, cal).requiredM) < 1e-9);
  for (const rack of layout.racks) rack.verticalManagement = false;
  const bare = { ...layout, racks: positionRacks(layout.racks, cal, inch) };
  assert.equal(estimateCable(bare, cable, cal).requiredM, estimateCable(bare, cable, oldCal).requiredM);
  assert.throws(() => estimateCable(layout, cable, { ...cal, equipmentWidthM: 24 * inch }), /Equipment width/);
  assert.throws(() => estimateCable(layout, cable, { ...cal, managerOverlapM: 3 * inch }), /overlap/);
  const project = defaultProject(defaultConfiguration(), 'metric');
  project.locations[0].calibration = cal;
  assert.ok(parseProject(JSON.parse(JSON.stringify(project))));
  project.locations[0].calibration.managerOverlapM = 6 * inch;
  assert.equal(parseProject(project), null);
});
test('cross-rack route always traverses both managers and the overhead tray in either direction', () => {
  const layout = fixtureLayout();
  const c = layout.cables.find(c => c.id === 'CR-0018')!;
  for (const cable of [c, { ...c, from: c.to, to: c.from }]) {
    const p = cablePoints(layout, cable, layout.racks.map(r => r.id));
    assert.equal(p.length, 6);
    assert.equal(p[1].x, p[2].x); assert.equal(p[2].y, p[3].y); assert.equal(p[3].x, p[4].x);
    assert.ok(p[2].y < p[0].y && p[2].y < p[5].y);
    assert.ok(!roundedPath(p).includes('NaN'));
  }
});
test('port halves choose managers independently on panels and both switch rows', () => {
  const layout = fixtureLayout();
  for (const rack of layout.racks) for (const equipment of rack.equipment) {
    for (let port = 1; port <= equipment.portCount; port++) {
      const expected = (port <= 12 || port >= 25 && port <= 36) ? 'left' : 'right';
      assert.equal(endpointSide(layout, { rackId: rack.id, equipmentId: equipment.id, port }), expected);
    }
  }
});
test('same-rack routing stays in one manager for the same half and uses the tray for opposite halves', () => {
  const layout = fixtureLayout();
  for (const [fromPort, toPort] of [[1, 12], [13, 48], [12, 13], [24, 25]]) {
    const c = { ...layout.cables[0], from: { ...layout.cables[0].from, port: fromPort }, to: { ...layout.cables[0].to, port: toPort } };
    const routing = cableRoute(layout, c);
    const points = cablePoints(layout, c, layout.racks.map(r => r.id));
    const estimate = estimateCable(layout, c, defaultCalibration);
    const opposite = routing.sides.from !== routing.sides.to;
    assert.equal(routing.cross, false);
    assert.equal(routing.overhead, opposite);
    assert.equal(points.length, opposite ? 6 : 4);
    assert.equal(estimate.overhead, opposite);
    if (opposite) {
      assert.ok(points[2].y < Math.min(points[0].y, points[5].y));
      assert.equal(points[2].y, points[3].y);
      assert.equal(estimate.segments['Overhead span'], defaultCalibration.rackWidthM);
      const a = resolveEndpoint(layout, c.from).equipment, b = resolveEndpoint(layout, c.to).equipment;
      assert.ok(Math.abs(estimate.segments['Managed vertical runs'] - ((42 - a.bottomU + .5) + (42 - b.bottomU + .5)) * .04445 - 2 * defaultCalibration.trayAboveRackM) < 1e-9);
    } else {
      assert.equal(points[1].x, points[2].x);
      assert.equal(estimate.segments['Overhead span'], 0);
    }
    const reverse = estimateCable(layout, { ...c, from: c.to, to: c.from }, defaultCalibration);
    assert.ok(Math.abs(estimate.requiredM - reverse.requiredM) < 1e-9);
  }
});
test('cross-rack paths honor all endpoint-side combinations, including full-width overhead routing', () => {
  const layout = fixtureLayout();
  for (const fromPort of [1, 24]) for (const toPort of [1, 24]) {
    const cable = { id: 'ROUTE-5', from: { rackId: 'CAB-A01', equipmentId: 'SW-A01', port: fromPort }, to: { rackId: 'CAB-A02', equipmentId: 'PP-B01', port: toPort }, vlan: 10, jacket: '#159de7' };
    const sides = routeSides(layout, cable);
    const points = cablePoints(layout, cable, layout.racks.map(r => r.id));
    assert.ok(cableRoute(layout, cable).overhead);
    assert.equal(sides.from, fromPort <= 12 ? 'left' : 'right');
    assert.equal(sides.to, toPort <= 12 ? 'left' : 'right');
    const lane = -4.4;
    assert.equal(points[1].x, rackX(0) + (fromPort <= 12 ? 26 : RACK_WIDTH - 26) + lane);
    assert.equal(points[4].x, rackX(1) + (toPort <= 12 ? 26 : RACK_WIDTH - 26) + lane);
    assert.equal(points[1].x, points[2].x);
    assert.equal(points[4].x, points[3].x);
    const estimate = estimateCable(layout, cable, defaultCalibration);
    const fromX = fromPort <= 12 ? 0 : .6, toX = .85 + (toPort <= 12 ? 0 : .6);
    assert.ok(Math.abs(estimate.segments['Overhead span'] - Math.abs(toX - fromX)) < 1e-9);
    const reversed = { ...cable, from: cable.to, to: cable.from };
    assert.deepEqual(cablePoints(layout, reversed, layout.racks.map(r => r.id)), [...points].reverse());
    assert.deepEqual(routeSides(layout, reversed), { from: sides.to, to: sides.from });
  }
});
test('length is physical, responds to gap/slack, and rounds to stocked length regardless of order', () => {
  const layout = fixtureLayout(), c = layout.cables.find(c => c.id === 'CR-0018')!;
  const original = estimateCable(layout, c, defaultCalibration);
  assert.ok(Math.abs(original.requiredM - 3.5743) < 1e-9);
  assert.equal(original.recommendedM, 5);
  const wider = structuredClone(layout); wider.racks[1].positionM += 2;
  assert.ok(Math.abs(estimateCable(wider, c, defaultCalibration).requiredM - original.requiredM - 2) < 1e-9);
  const slack = estimateCable(layout, c, { ...defaultCalibration, slackM: 2.5, stockedLengthsM: [10, 3, 7, 5] });
  assert.equal(slack.recommendedM, 7);
  assert.equal(estimateCable(layout, c, { ...defaultCalibration, stockedLengthsM: [1] }).recommendedM, null);
});
test('rejects occupied endpoints, self connections, nonexistent and fractional ports', () => {
  const layout = fixtureLayout(), c = layout.cables[0];
  assert.match(connectionError(layout, { ...c, id: 'NEW' })!, /already connected/);
  assert.match(connectionError(layout, { ...c, to: c.from })!, /different ports/);
  for (const port of [0, 25, 1.5, NaN]) assert.throws(() => resolveEndpoint(layout, { ...c.from, port }));
  assert.throws(() => estimateCable(layout, c, { ...defaultCalibration, rackWidthM: 0 }));
});
test('supports an additional rack with valid endpoints and routes', () => {
  const layout = fixtureLayout(); layout.racks.push(makeRack(2));
  const cable = { ...layout.cables[0], id: 'NEW', from: { ...layout.cables[0].from, port: 24 }, to: { rackId: 'CAB-A03', equipmentId: 'SW-C01', port: 48 } };
  assert.equal(connectionError(layout, cable), null);
  assert.equal(cablePoints(layout, cable, layout.racks.map(r => r.id)).length, 6);
});

test('length units convert exactly at known boundaries and preserve physical recommendations', () => {
  assert.equal(toMeters(1, 'imperial'), .0254);
  assert.equal(fromMeters(.0254, 'imperial'), 1);
  assert.equal(formatLengthValue(3.1668, 'imperial'), '124.68');
  assert.equal(formatLengthValue(5, 'imperial'), '196.85');
  assert.equal(formatLengthValue(0, 'imperial'), '0.00');
  for (const meters of [.1, .25, .5, 3.1668, 20]) {
    assert.equal(fromMeters(meters, 'metric'), meters);
    assert.ok(Math.abs(toMeters(fromMeters(meters, 'imperial'), 'imperial') - meters) < 1e-12);
  }
});

test('configuration validates VLAN identities, names, colors and references', () => {
  const config = defaultConfiguration();
  assert.match(vlanError({ id: 30, name: 'Duplicate', color: '#abcdef' }, config.vlans)!, /already exists/);
  for (const id of [0, 4095, 1.5, NaN]) assert.ok(vlanError({ id, name: 'Invalid', color: '#abcdef' }, []));
  assert.ok(vlanError({ id: 100, name: ' ', color: '#abcdef' }, []));
  assert.ok(vlanError({ id: 100, name: 'Test', color: 'red' }, []));
  assert.equal(vlanError({ id: 30, name: 'Telephony', color: '#abcdef' }, config.vlans, 30), null);
  assert.ok(vlanError({ id: 31, name: 'Telephony', color: '#abcdef' }, config.vlans, 30));
  assert.ok(vlanRemovalError(30, fixtureLayout().cables));
  assert.equal(vlanRemovalError(99, fixtureLayout().cables), null);
});
test('stock validation compares physical sizes and allows an empty catalog', () => {
  for (const n of [0, -1, NaN, Infinity]) assert.ok(stockLengthError(n, []));
  assert.ok(stockLengthError(toMeters(39.37008, 'imperial'), [1]));
  assert.equal(stockLengthError(1, [1], 0), null);
  assert.equal(stockLengthError(toMeters(144, 'imperial'), [3, 5]), null);
  const layout = fixtureLayout(), cable = layout.cables.find(c => c.id === 'CR-0018')!;
  assert.equal(estimateCable(layout, cable, { ...defaultCalibration, stockedLengthsM: [] }).recommendedM, null);
  assert.equal(estimateCable(layout, cable, { ...defaultCalibration, stockedLengthsM: [toMeters(144, 'imperial'), 5] }).recommendedM, toMeters(144, 'imperial'));
});
test('stored configuration is validated and missing VLANs do not leave dangling demo connections', () => {
  const config = defaultConfiguration();
  assert.deepEqual(parseConfiguration(config), config);
  for (const bad of [null, {}, { ...config, version: 2 }, { ...config, vlans: [null] }, { ...config, vlans: [...config.vlans, config.vlans[0]] }, { ...config, stockedLengthsM: ['5'] }, { ...config, stockedLengthsM: [-1] }]) assert.equal(parseConfiguration(bad), null);
  assert.deepEqual(parseConfiguration({ version: 1, vlans: [], stockedLengthsM: [] }), { version: 1, vlans: [], stockedLengthsM: [] });
  const vlans = config.vlans.filter(v => v.id !== 30);
  assert.ok(fixtureLayout(vlans).cables.every(c => vlans.some(v => v.id === c.vlan)));
  const custom = { id: 200, name: 'Lab', color: '#123456' };
  const layout = fixtureLayout();
  const cable = { ...layout.cables[0], vlan: custom.id };
  assert.equal(connectionError(layout, cable, [...config.vlans, custom]), null);
  assert.ok(connectionError(layout, cable, config.vlans));
});


test('port VLANs can be assigned, reassigned and cleared without creating cables', () => {
  const original = fixtureLayout();
  for (const equipmentId of ['PP-A04', 'SW-A01']) {
    const endpoint = { rackId: 'CAB-A01', equipmentId, port: 24 };
    assert.equal(portVlan(original, endpoint), null);
    const assigned = assignPortVlan(original, endpoint, 99);
    assert.equal(portVlan(assigned, endpoint), 99);
    assert.equal(assigned.cables, original.cables);
    assert.equal(portVlan(original, endpoint), null);
    assert.match(vlanRemovalError(99, assigned.cables, assigned.portVlans)!, /port assignments/);
    const changed = assignPortVlan(assigned, endpoint, 60);
    assert.equal(portVlan(changed, endpoint), 60);
    assert.equal(portVlan(assigned, endpoint), 99);
    const cleared = assignPortVlan(changed, endpoint, null);
    assert.equal(portVlan(cleared, endpoint), null);
    assert.equal(Object.hasOwn(cleared.portVlans!, endpointKey(endpoint)), false);
    assert.equal(vlanRemovalError(99, cleared.cables, cleared.portVlans), null);
    assert.throws(() => assignPortVlan(original, endpoint, 200), /configured VLAN/);
    assert.throws(() => assignPortVlan(original, { ...endpoint, port: 100 }, 99), /valid rack/);
  }
});

test('connected ports retain independent assignments when cables change or are removed', () => {
  const original = fixtureLayout();
  const cable = original.cables.find(c => c.id === 'CR-0018')!;
  const assigned = assignPortVlan(original, cable.from, 99);
  assert.equal(assigned.cables.find(c => c.id === cable.id)!.vlan, 30);
  assert.equal(portVlan(assigned, cable.to), 30);
  const removed = { ...assigned, cables: assigned.cables.filter(c => c.id !== cable.id) };
  assert.equal(portVlan(removed, cable.from), 99);
  assert.equal(portVlan(removed, cable.to), 30);
  assert.ok(vlanRemovalError(99, removed.cables, removed.portVlans));
  assert.deepEqual(JSON.parse(JSON.stringify(removed)).portVlans, removed.portVlans);
});


test('bulk VLAN assignments validate the whole batch and preserve unrelated ports and cables', () => {
  const layout = fixtureLayout();
  const endpoints = [18, 23, 24].map(port => ({ rackId: 'CAB-A01', equipmentId: 'PP-A04', port }));
  const assigned = assignPortVlans(layout, [...endpoints, endpoints[0]], 99);
  for (const endpoint of endpoints) assert.equal(portVlan(assigned, endpoint), 99);
  assert.equal(assigned.cables, layout.cables);
  assert.equal(portVlan(layout, endpoints[0]), 30);
  assert.equal(portVlan(layout, endpoints[1]), null);
  for (const [key, value] of Object.entries(layout.portVlans!)) {
    if (!endpoints.some(ep => endpointKey(ep) === key)) assert.equal(assigned.portVlans![key], value);
  }
  const snapshot = structuredClone(assigned);
  assert.throws(() => assignPortVlans(assigned, [...endpoints, { ...endpoints[0], port: 25 }], 60));
  assert.throws(() => assignPortVlans(assigned, endpoints, 4094));
  assert.deepEqual(assigned, snapshot);
  const cleared = assignPortVlans(assigned, endpoints, null);
  for (const endpoint of endpoints) assert.equal(portVlan(cleared, endpoint), null);
  assert.equal(vlanRemovalError(99, cleared.cables, cleared.portVlans), null);
});

// Saved projects keep layout identities independent of location display names.
import { defaultProject, parseProject, importProject, upsertLocation, archiveLocation } from '../src/project';

test('locations have stable identities, independent layouts and reversible archives', () => {
  const original = defaultProject(defaultConfiguration(), 'metric');
  const draft = { name: 'MDF-01', type: 'MDF' as const, building: 'Building A', floor: '1', room: '101', notes: 'Main distribution' };
  const copied = upsertLocation(original, draft, undefined, original.activeLocationId);
  const mdf = copied.locations[1];
  assert.equal(copied.buildings.length, 1);
  assert.equal(mdf.layout.racks.length, 2);
  assert.deepEqual(mdf.layout.cables, []);
  assert.deepEqual(mdf.layout.portVlans, {});
  assert.notEqual(mdf.layout.racks, original.locations[0].layout.racks);
  const renamed = upsertLocation(copied, { ...draft, name: 'Main MDF', building: 'Building B' }, mdf.id);
  assert.equal(renamed.locations[1].id, mdf.id);
  assert.equal(renamed.locations[1].layout, mdf.layout);
  assert.equal(renamed.buildings.length, 2);
  assert.throws(() => upsertLocation(copied, { ...draft, name: ' mdf-01 ' }), /already exists/);
  const archived = archiveLocation({ ...renamed, activeLocationId: mdf.id }, mdf.id);
  assert.equal(archived.activeLocationId, original.activeLocationId);
  assert.equal(archived.locations[1].archived, true);
  assert.equal(archived.locations[1].layout, mdf.layout);
  assert.throws(() => archiveLocation(archived, original.activeLocationId), /one active/);
  const empty = upsertLocation(original, draft).locations[1];
  assert.equal(empty.layout.racks.length, 0);
  assert.ok(parseProject(archived));
});

test('project imports validate identities, endpoints, VLAN references and calibration before replacement', () => {
  const project = defaultProject(defaultConfiguration(), 'imperial');
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
  const corruptions = [
    (p: typeof project) => { p.activeLocationId = 'missing'; },
    (p: typeof project) => { p.locations[0].archived = true; },
    (p: typeof project) => { p.locations[0].buildingId = 'missing'; },
    (p: typeof project) => { p.locations.push(structuredClone(p.locations[0])); },
    (p: typeof project) => { p.locations[0].layout.cables[0].from.port = 100; },
    (p: typeof project) => { p.locations[0].layout.cables[0].vlan = 4094; },
    (p: typeof project) => { p.locations[0].layout.portVlans!['CAB-A01/PP-A01/100'] = 10; },
    (p: typeof project) => { p.locations[0].layout.portVlans!['CAB-A01/PP-A01/1'] = 4094; },
    (p: typeof project) => { p.locations[0].layout.racks[0].equipment[0].portCount = 257; },
    (p: typeof project) => { p.locations[0].layout.racks[0].equipment[0].bottomU = 41; },
    (p: typeof project) => { p.locations[0].calibration.rackWidthM = 0; },
    (p: typeof project) => { p.locations[0].rackGap = -1; },
    (p: typeof project) => { p.locations[0].layout.cables.push({ ...p.locations[0].layout.cables[0], id: 'DUPLICATE' }); },
  ];
  for (const corrupt of corruptions) { const clone = structuredClone(project); corrupt(clone); assert.equal(parseProject(clone), null); }
  for (const bad of [null, {}, { ...project, schemaVersion: 100 }]) assert.equal(importProject(bad), null);
  const legacy = { schemaVersion: 1, layout: project.locations[0].layout, calibration: project.locations[0].calibration, configuration: project.configuration, preferences: project.preferences };
  const migrated = importProject(legacy)!;
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.locations[0].layout, legacy.layout);
  assert.equal(migrated.preferences.lengthUnit, 'imperial');
  assert.ok(parseProject(migrated));
});


test('additional template racks retain valid identifiers beyond rack Z', () => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  project.locations[0].layout.racks.push(makeRack(26), makeRack(99));
  assert.equal(project.locations[0].layout.racks[2].equipment[0].id, 'PP-AA01');
  assert.ok(parseProject(project));
  const invalid = structuredClone(project);
  invalid.locations[0].layout.racks[0].equipment = [];
  assert.equal(parseProject(invalid), null);
});

test('custom rack heights persist and size the rack scene', () => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  const rack = makeRack(2, 60);
  rack.equipment = [];
  project.locations[0].layout.racks.push(rack);
  assert.ok(parseProject(project));
  assert.equal(project.locations[0].layout.racks[2].heightU, 60);
  assert.equal(sceneSize(1, 60).height, TOP + 60 * UNIT + 35);
  for (const heightU of [0, 1.5, 101]) {
    const invalid = structuredClone(project);
    invalid.locations[0].layout.racks[2].heightU = heightU;
    assert.equal(parseProject(invalid), null);
  }
});

test('patch panel batches number continuously, skip occupied units and fail atomically', () => {
  const layout = fixtureLayout();
  const first = { rackId: 'CAB-A01', templateId: EQUIPMENT_TEMPLATES[0].id, id: 'NEW-PANEL', label: 'Panel', bottomU: 17 };
  const before = JSON.stringify(layout);
  const rows = planPatchPanels(layout, first, 9, 1);
  const next = createPatchPanels(layout, rows);
  assert.deepEqual(rows.map(p => p.portStart), [1, 25, 49, 73, 97, 121, 145, 169, 193]);
  assert.equal(next.racks[0].equipment.find(p => p.id === rows[8].id)!.portStart, 193);
  assert.equal(JSON.stringify(layout), before);
  const insufficient = planPatchPanels(layout, { ...first, bottomU: 1 }, 2, 1);
  assert.equal(insufficient[1].bottomU, 0);
  assert.throws(() => createPatchPanels(layout, insufficient), /Panel 2/);
  assert.equal(JSON.stringify(layout), before);
  assert.throws(() => planPatchPanels(layout, first, 0, 1), /panels/);
  assert.throws(() => planPatchPanels(layout, first, 2, 999990), /Port numbers/);
  assert.throws(() => createPatchPanels(layout, [rows[0], { ...rows[1], bottomU: rows[0].bottomU }]), /Overlaps/);
  const withGap = { ...layout, racks: layout.racks.map((r, i) => i ? r : { ...r, equipment: [...r.equipment, { ...r.equipment[0], id: 'OCCUPIED', bottomU: 16 }] }) };
  assert.deepEqual(planPatchPanels(withGap, first, 2, 1).map(p => p.bottomU), [17, 15]);
});


test('patch-panel details update independently and survive cable removal', () => {
  const original = fixtureLayout();
  const cable = original.cables.find(c => c.id === 'CR-0018')!;
  const free = { ...cable.from, port: 24 };
  const details = { facilityLocation: 'Building A / 2 / Room 214', notes: 'Outlet A-214-02\nWest wall' };
  for (const endpoint of [cable.from, free]) {
    const assigned = setPatchPortDetails(original, endpoint, details);
    assert.deepEqual(patchPortDetails(assigned, endpoint), details);
    assert.equal(assigned.cables, original.cables);
    assert.equal(assigned.portVlans, original.portVlans);
    assert.deepEqual(patchPortDetails(original, endpoint), { facilityLocation: '', notes: '' });
    const removed = { ...assigned, cables: assigned.cables.filter(c => c.id !== cable.id) };
    assert.deepEqual(patchPortDetails(removed, endpoint), details);
    const cleared = setPatchPortDetails(assigned, endpoint, { facilityLocation: '', notes: '' });
    assert.equal(Object.hasOwn(cleared.portDetails!, endpointKey(endpoint)), false);
    assert.deepEqual(patchPortDetails(assigned, endpoint), details);
  }
  assert.throws(() => setPatchPortDetails(original, cable.to, details), /patch-panel/);
  assert.throws(() => setPatchPortDetails(original, { ...free, port: 25 }, details));
  assert.throws(() => setPatchPortDetails(original, free, { ...details, facilityLocation: 'x'.repeat(PORT_LOCATION_MAX + 1) }));
  assert.throws(() => setPatchPortDetails(original, free, { ...details, notes: 'x'.repeat(PORT_NOTES_MAX + 1) }));
});

test('saved projects validate port details, accept older files and keep equipment copies undocumented', () => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  assert.ok(parseProject(project));
  const endpoint = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 24 };
  const details = { facilityLocation: 'Room 214', notes: 'Outlet A-214-02\nWest wall' };
  project.locations[0].layout = setPatchPortDetails(project.locations[0].layout, endpoint, details);
  const restored = importProject(JSON.parse(JSON.stringify(project)))!;
  assert.deepEqual(patchPortDetails(restored.locations[0].layout, endpoint), details);
  const copied = upsertLocation(project, { name: 'IDF-02', type: 'IDF', building: 'Building A', floor: '', room: '', notes: '' }, undefined, 'idf-01');
  assert.deepEqual(patchPortDetails(copied.locations[1].layout, endpoint), { facilityLocation: '', notes: '' });
  for (const [key, value] of [
    ['CAB-A01/PP-A04/25', details],
    ['CAB-A01/SW-A01/24', details],
    [endpointKey(endpoint), null],
    [endpointKey(endpoint), { facilityLocation: 214, notes: '' }],
    [endpointKey(endpoint), { ...details, notes: 'x'.repeat(PORT_NOTES_MAX + 1) }],
    [endpointKey(endpoint), { ...details, facilityLocation: 'x'.repeat(PORT_LOCATION_MAX + 1) }],
  ] as const) {
    const invalid = structuredClone(project);
    (invalid.locations[0].layout as unknown as Record<string, unknown>).portDetails = { [key]: value };
    assert.equal(parseProject(invalid), null);
  }
});


test('bulk port details preserve untouched fields and unselected ports and validate atomically', () => {
  const endpoint = (port: number) => ({ rackId: 'CAB-A01', equipmentId: 'PP-A04', port });
  let original = fixtureLayout();
  for (const port of [18, 23, 24]) original = setPatchPortDetails(original, endpoint(port), { facilityLocation: `Room ${port}`, notes: `Outlet ${port}` });
  const selected = [endpoint(18), endpoint(24)];
  const updated = updatePatchPortsDetails(original, selected, { facilityLocation: 'West wing' });
  for (const ep of selected) assert.deepEqual(patchPortDetails(updated, ep), { facilityLocation: 'West wing', notes: `Outlet ${ep.port}` });
  assert.deepEqual(patchPortDetails(updated, endpoint(23)), patchPortDetails(original, endpoint(23)));
  assert.equal(updated.cables, original.cables);
  assert.equal(updated.portVlans, original.portVlans);
  assert.equal(patchPortDetails(original, endpoint(18)).facilityLocation, 'Room 18');
  const cleared = updatePatchPortsDetails(updated, selected, { notes: '' });
  for (const ep of selected) assert.deepEqual(patchPortDetails(cleared, ep), { facilityLocation: 'West wing', notes: '' });
  const empty = updatePatchPortsDetails(cleared, selected, { facilityLocation: '', notes: '' });
  for (const ep of selected) assert.equal(Object.hasOwn(empty.portDetails!, endpointKey(ep)), false);
  const snapshot = structuredClone(original);
  for (const invalid of [{ notes: 'x'.repeat(PORT_NOTES_MAX + 1) }, { facilityLocation: 'x'.repeat(PORT_LOCATION_MAX + 1) }]) assert.throws(() => updatePatchPortsDetails(original, selected, invalid));
  assert.throws(() => updatePatchPortsDetails(original, [endpoint(18), endpoint(25)], { notes: 'test' }));
  assert.throws(() => updatePatchPortsDetails(original, [endpoint(18), { ...endpoint(24), equipmentId: 'SW-A01' }], { notes: 'test' }));
  assert.deepEqual(original, snapshot);
});


test('rack removal deletes only its equipment, connections and port metadata', () => {
  let layout = fixtureLayout();
  const a = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 18 };
  const b = { rackId: 'CAB-A02', equipmentId: 'PP-B01', port: 24 };
  layout.racks.push({ ...makeRack(2), id: 'CAB-A010' });
  const prefixNeighbor = { rackId: 'CAB-A010', equipmentId: 'PP-C01', port: 1 };
  for (const ep of [a, b, prefixNeighbor]) layout = setPatchPortDetails(assignPortVlan(layout, ep, 99), ep, { facilityLocation: ep.rackId, notes: 'Keep with port' });
  const before = structuredClone(layout);
  const impact = rackRemovalImpact(layout, 'CAB-A01');
  assert.equal(impact.equipment, 25);
  assert.equal(impact.ports, 720);
  assert.equal(impact.connections, 17);
  assert.equal(impact.vlanAssignments, 32);
  assert.equal(impact.documentedPorts, 1);
  const removed = removeRack(layout, 'CAB-A01');
  assert.deepEqual(removed.racks, layout.racks.slice(1));
  assert.equal(removed.racks[0].positionM, .85);
  assert.equal(removed.cables.length, 15);
  assert.ok(removed.cables.every(c => c.from.rackId === 'CAB-A02' && c.to.rackId === 'CAB-A02'));
  assert.equal(Object.keys(removed.portVlans!).some(key => key.startsWith('CAB-A01/')), false);
  assert.equal(Object.keys(removed.portDetails!).some(key => key.startsWith('CAB-A01/')), false);
  for (const ep of [b, prefixNeighbor]) {
    assert.deepEqual(patchPortDetails(removed, ep), patchPortDetails(layout, ep));
    assert.equal(portVlan(removed, ep), 99);
  }
  // The other end of a removed cross-cabinet cable keeps its independent VLAN.
  assert.equal(portVlan(removed, { rackId: 'CAB-A02', equipmentId: 'SW-B01', port: 18 }), 30);
  assert.deepEqual(layout, before);
  assert.throws(() => removeRack(layout, 'missing'), /existing rack/);
  const project = defaultProject(defaultConfiguration(), 'metric');
  project.locations[0].layout = removed;
  assert.ok(parseProject(project));
});

test('the final rack can be removed without deleting the location or leaving references', () => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  const originalLocation = project.locations[0];
  const removed = removeRack(removeRack(originalLocation.layout, 'CAB-A01'), 'CAB-A02');
  assert.deepEqual(removed.racks, []);
  assert.deepEqual(removed.cables, []);
  assert.deepEqual(removed.portVlans, {});
  project.locations[0] = { ...originalLocation, layout: removed };
  assert.ok(parseProject(project));
  assert.equal(project.activeLocationId, originalLocation.id);
});


test('image templates preserve saved port identities and data, validate compatibility, and round-trip', () => {
  let layout = fixtureLayout();
  const endpoint = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 18 };
  layout = setPatchPortDetails(layout, endpoint, { facilityLocation: 'Room 214', notes: 'Outlet 18' });
  const before = structuredClone(layout);
  const imaged = setEquipmentTemplate(layout, endpoint.rackId, endpoint.equipmentId, 'netbox-generic-copper-24');
  assert.equal(imaged.cables, layout.cables);
  assert.equal(imaged.portVlans, layout.portVlans);
  assert.equal(imaged.portDetails, layout.portDetails);
  assert.equal(resolveEndpoint(imaged, endpoint).equipment.id, endpoint.equipmentId);
  assert.deepEqual(layout, before);
  assert.throws(() => setEquipmentTemplate(layout, endpoint.rackId, endpoint.equipmentId, 'netbox-ubiquiti-us-48'), /compatible/);
  assert.throws(() => setEquipmentTemplate(layout, endpoint.rackId, endpoint.equipmentId, 'unknown'), /compatible/);
  assert.deepEqual(setEquipmentTemplate(imaged, endpoint.rackId, endpoint.equipmentId, null), layout);
  const project = defaultProject(defaultConfiguration(), 'metric');
  project.locations[0].layout = imaged;
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
  const copy = upsertLocation(project, { name: 'IDF-02', type: 'IDF', building: 'Building A', floor: '', room: '', notes: '' }, undefined, 'idf-01');
  assert.equal(resolveEndpoint(copy.locations[1].layout, endpoint).equipment.templateId, 'netbox-generic-copper-24');
  for (const templateId of ['unknown', 'netbox-ubiquiti-us-48']) {
    const invalid = structuredClone(project);
    invalid.locations[0].layout.racks[0].equipment[3].templateId = templateId;
    assert.equal(parseProject(invalid), null);
  }
});

test('image sockets align to source bounds and switch routes follow odd/even numbering', () => {
  let layout = fixtureLayout();
  layout = setEquipmentTemplate(layout, 'CAB-A01', 'PP-A01', 'netbox-generic-copper-24');
  layout = setEquipmentTemplate(layout, 'CAB-A02', 'SW-B01', 'netbox-ubiquiti-us-48');
  const rackIds = layout.racks.map(r => r.id);
  const ep = (port: number) => ({ rackId: 'CAB-A02', equipmentId: 'SW-B01', port });
  const first = portPoint(layout, ep(1), rackIds), second = portPoint(layout, ep(2), rackIds), third = portPoint(layout, ep(3), rackIds);
  assert.equal(first.x, second.x);
  assert.ok(first.y < second.y);
  assert.ok(third.x > first.x);
  assert.equal(first.y, third.y);
  assert.equal(endpointSide(layout, ep(13)), 'left');
  assert.equal(endpointSide(layout, ep(24)), 'left');
  assert.equal(endpointSide(layout, ep(25)), 'right');
  assert.equal(endpointSide(layout, ep(48)), 'right');
  const patch = { rackId: 'CAB-A01', equipmentId: 'PP-A01', port: 1 };
  const point = portPoint(layout, patch, rackIds);
  const patchScale = Math.min(EQUIPMENT_FACE.width / 1462, EQUIPMENT_FACE.height / 134);
  assert.ok(Math.abs(point.x - (rackX(0) + EQUIPMENT_FACE.x + (EQUIPMENT_FACE.width - 1462 * patchScale) / 2 + 81 * patchScale)) < 1e-9);
  assert.ok(Math.abs(point.y - (TOP + EQUIPMENT_FACE.y + (EQUIPMENT_FACE.height - 134 * patchScale) / 2 + 65 * patchScale)) < 1e-9);
  for (const template of EQUIPMENT_TEMPLATES) {
    assert.equal(template.ports.length, template.portCount);
    const seen = new Set<string>();
    for (const port of template.ports) {
      assert.ok(port.x - port.width / 2 > 0 && port.x + port.width / 2 < 1);
      assert.ok(port.y - port.height / 2 > 0 && port.y + port.height / 2 < 1);
      assert.ok(port.width > 0 && port.height > 0);
      seen.add(`${port.x}/${port.y}`);
    }
    assert.equal(seen.size, template.portCount);
  }
  const size = portSize(resolveEndpoint(layout, ep(1)).equipment, 1);
  assert.ok(Math.abs(size.width - 20 * Math.min(EQUIPMENT_FACE.width / 824, EQUIPMENT_FACE.height / 77)) < 1e-9);
  const cable = { id: 'IMAGE-1', from: { ...patch, port: 18 }, to: ep(18), vlan: 30, jacket: '#159de7' };
  assert.deepEqual(routeSides(layout, cable), { from: 'right', to: 'left' });
  const points = cablePoints(layout, cable, rackIds);
  assert.deepEqual(points[0], portPoint(layout, cable.from, rackIds));
  assert.deepEqual(points[points.length - 1], portPoint(layout, cable.to, rackIds));
  assert.deepEqual(cablePoints(layout, { ...cable, from: cable.to, to: cable.from }, rackIds), [...points].reverse());
  const estimate = estimateCable(layout, cable, defaultCalibration);
  assert.ok(Number.isFinite(estimate.requiredM) && estimate.requiredM > 0);
  assert.ok(Math.abs(estimate.segments['Overhead span'] - .25) < 1e-9);
  assert.ok(Math.abs(estimate.requiredM - estimateCable(layout, { ...cable, from: cable.to, to: cable.from }, defaultCalibration).requiredM) < 1e-9);
});


test('rack units and image overlays share proportional geometry without distorting source images', () => {
  assert.ok(Math.abs(UNIT / EQUIPMENT_FACE.width - 1.75 / 19) < 1e-12);
  assert.equal(sceneSize(2).height, TOP + 42 * UNIT + 35);
  for (const template of EQUIPMENT_TEMPLATES) {
    let layout = fixtureLayout();
    const equipmentId = template.kind === 'switch' ? 'SW-A01' : 'PP-A01';
    layout = setEquipmentTemplate(layout, 'CAB-A01', equipmentId, template.id);
    const ep = { rackId: 'CAB-A01', equipmentId, port: 1 };
    const { equipment } = resolveEndpoint(layout, ep);
    const bounds = equipmentImageBounds(equipment);
    assert.ok(Math.abs(bounds.width / bounds.height - template.imageWidth / template.imageHeight) < 1e-12);
    assert.ok(bounds.x >= EQUIPMENT_FACE.x - 1e-9 && bounds.y >= EQUIPMENT_FACE.y - 1e-9);
    assert.ok(bounds.x + bounds.width <= EQUIPMENT_FACE.x + EQUIPMENT_FACE.width + 1e-9);
    assert.ok(bounds.y + bounds.height <= UNIT - EQUIPMENT_FACE.y + 1e-9);
    const imageTop = TOP + (42 - equipment.bottomU) * UNIT + bounds.y;
    for (let port = 1; port <= template.portCount; port++) {
      const point = portPoint(layout, { ...ep, port }, ['CAB-A01']);
      const size = portSize(equipment, port), socket = template.ports[port - 1];
      assert.ok(Math.abs((point.x - rackX(0) - bounds.x) / bounds.width - socket.x) < 1e-12);
      assert.ok(Math.abs((point.y - imageTop) / bounds.height - socket.y) < 1e-12);
      assert.ok(Math.abs(size.width / size.height - socket.width * template.imageWidth / (socket.height * template.imageHeight)) < 1e-12);
    }
  }
});

test('NetBox YAML imports physical port definitions, ranges and source names with strict validation', () => {
  const panel = parseDeviceDefinition(readFileSync('public/equipment/netbox/24-port-copper-patch-panel.yaml', 'utf8'));
  assert.equal(panel.kind, 'patch-panel'); assert.equal(panel.ports.length, 24); assert.equal(panel.heightU, 1);
  const sw = parseDeviceDefinition(readFileSync('public/equipment/netbox/US-48.yaml', 'utf8'));
  assert.equal(sw.ports.length, 52); assert.equal(sw.ports.filter(p => p.type === '1000base-t').length, 48);
  const ranged = 'manufacturer: Acme\nmodel: Panel\nu_height: 1\nfront-ports:\n  - {name: "Outlet [1-24]", type: 8p8c}';
  assert.equal(parseDeviceDefinition(ranged).ports[23].name, 'Outlet 24');
  for (const invalid of [ranged.replace('u_height: 1', 'u_height: 0'), ranged.replace('model: Panel', 'model: A\nmodel: B'), ranged + '\n---\nmodel: Extra', ranged.replace('[1-24]', '[1-100000]'), ranged.replace('  - {name:', '  - &a {name:') + '\n  - *a', 'model: [']) assert.throws(() => parseDeviceDefinition(invalid));
});

function importedPanel(): EquipmentTemplate {
  const bundled = EQUIPMENT_TEMPLATES[0];
  return { ...bundled, id: 'custom-test-panel', name: 'Imported panel', imageSrc: `data:image/png;base64,${readFileSync('public/equipment/netbox/generic-24-port-copper-patch-panel.front.png').toString('base64')}`,
    source: { manufacturer: 'Generic', model: '24-port panel', filename: 'panel.yaml' }, ports: bundled.ports.map((p, i) => ({ ...p, name: `Outlet ${i + 1}` })) };
}

test('custom templates are shared, preserve assignments and routes, and round-trip without duplicate images', () => {
  let project = defaultProject(defaultConfiguration(), 'metric');
  const template = importedPanel();
  project = saveEquipmentTemplate(project, template);
  const ep = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 18 };
  const before = structuredClone(project.locations[0].layout);
  const { templates: catalog, ...saved } = setEquipmentTemplate(projectLayout(project, 'idf-01'), ep.rackId, ep.equipmentId, template.id);
  assert.equal(catalog![0].id, template.id);
  project.locations[0].layout = saved;
  assert.deepEqual(saved.cables, before.cables); assert.deepEqual(saved.portVlans, before.portVlans);
  project = upsertLocation(project, { name: 'IDF-02', type: 'IDF', building: 'Building A', floor: '', room: '', notes: '' }, undefined, 'idf-01');
  assert.equal(templateUsage(project, template.id), 2);
  assert.equal(projectLayout(project, project.locations[1].id).templates, project.templates);
  assert.equal(JSON.stringify(project).split('data:image/png;base64,').length - 1, 1);
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
  const layout = projectLayout(project, 'idf-01');
  assert.equal(endpointSide(layout, ep), 'right');
  assert.notDeepEqual(portPoint(layout, ep, ['CAB-A01']), portPoint(before, ep, ['CAB-A01']));
  assert.throws(() => removeEquipmentTemplate(project, template.id), /used/);
  assert.throws(() => saveEquipmentTemplate(project, { ...template, ports: template.ports.map((p, i) => ({ ...p, name: `Changed ${i}` })) }), /identities/);
  project = saveEquipmentTemplate(project, { ...template, ports: template.ports.map(p => ({ ...p, x: 1 - p.x })) });
  assert.equal(endpointSide(projectLayout(project, 'idf-01'), ep), 'left');
  assert.ok(parseProject(project));
  const missing = structuredClone(project); missing.templates = []; assert.equal(parseProject(missing), null);
  const duplicate = structuredClone(project); duplicate.templates!.push(duplicate.templates![0]); assert.equal(parseProject(duplicate), null);
  assert.throws(() => setEquipmentTemplate(projectLayout(project, 'idf-01'), 'CAB-A01', 'SW-A01', template.id), /compatible/);
  const unused = defaultProject(defaultConfiguration(), 'metric');
  assert.deepEqual(removeEquipmentTemplate(saveEquipmentTemplate(unused, template), template.id).templates, []);
});

test('custom map validation rejects unsafe images, invalid bounds, overlapping sockets and invalid grids', () => {
  const template = importedPanel();
  assert.ok(validCustomTemplates([template]));
  assert.equal(validCustomTemplates([{ ...template, imageSrc: 'https://example.com/image.png' }]), false);
  assert.equal(validCustomTemplates([{ ...template, imageSrc: 'data:image/svg+xml;base64,PHN2Zz4=' }]), false);
  assert.equal(validCustomTemplates([{ ...template, imageSrc: 'data:image/png;base64,bm90LXBuZw==' }]), false);
  assert.equal(validCustomTemplates([{ ...template, ports: template.ports.map((p, i) => i ? p : { ...p, x: 2 }) }]), false);
  assert.equal(validCustomTemplates([{ ...template, ports: template.ports.map((p, i) => i === 1 ? { ...template.ports[0], name: p.name } : p) }]), false);
  assert.equal(validCustomTemplates([{ ...template, portCount: 48 }]), false);
  const ports = gridPorts(['1', '2', '3', '4'], 2, 'columns', .1, .9, .25, .75, .05, .15);
  assert.equal(ports[0].x, ports[1].x); assert.ok(ports[0].y < ports[1].y); assert.ok(ports[2].x > ports[0].x);
  assert.throws(() => gridPorts(['1'], 0, 'rows', 0, 1, 0, 1, .1, .1));
});


test('equipment placement supports arbitrary port counts and whole rack heights without overlaps', () => {
  const template = { ...importedPanel(), id: 'custom-tall-panel', heightU: 2 };
  const layout = { ...fixtureLayout(), templates: [template] };
  const before = structuredClone(layout);
  const draft = { rackId: 'CAB-A01', templateId: template.id, id: 'PP-NEW', label: 'Tall panel', bottomU: 16 };
  const next = addEquipment(layout, draft);
  const e = resolveEndpoint(next, { rackId: draft.rackId, equipmentId: draft.id, port: 24 }).equipment;
  assert.equal(equipmentTopU(e), 17);
  assert.equal(firstFreeUnit(layout.racks[0], 2), 16);
  assert.equal(firstFreeUnit(next.racks[0], 2), 14);
  for (const bottomU of [0, 16.5, 17, 18, 42]) assert.throws(() => addEquipment(layout, { ...draft, bottomU }));
  assert.throws(() => addEquipment(next, { ...draft, bottomU: 1 }), /unique/);
  assert.deepEqual(layout, before);
  assert.equal(next.cables, layout.cables);
  assert.equal(next.portVlans, layout.portVlans);
  const project = defaultProject(defaultConfiguration(), 'metric'); project.templates = [template];
  const { templates: _catalog, ...saved } = next; project.locations[0].layout = saved;
  assert.ok(parseProject(project));
  for (const patch of [{ bottomU: 17 }, { heightU: 0 }, { heightU: 1.5 }, { portCount: 0 }, { portCount: 257 }]) {
    const invalid = structuredClone(project); Object.assign(invalid.locations[0].layout.racks[0].equipment.find(e => e.id === draft.id)!, patch); assert.equal(parseProject(invalid), null);
  }
  const empty = { ...layout.racks[0], equipment: [] };
  assert.equal(placementError(empty, 1, 42), null);
  assert.equal(firstFreeUnit({ ...empty, equipment: [{ ...e, bottomU: 1, heightU: 42 }] }, 1), null);
});

test('moves preserve and remap connected ports and documentation atomically across racks', () => {
  const ep = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 18 };
  let layout = setPatchPortDetails(fixtureLayout(), ep, { facilityLocation: 'Room 214', notes: 'Keep this' });
  layout = assignPortVlan(layout, ep, 99);
  // A similarly prefixed device must not have its metadata moved or removed.
  layout.racks[0].equipment.push({ ...layout.racks[0].equipment[3], id: 'PP-A040', bottomU: 17 });
  const neighbor = { ...ep, equipmentId: 'PP-A040' };
  layout = setPatchPortDetails(layout, neighbor, { facilityLocation: 'Neighbor', notes: '' });
  const before = structuredClone(layout);
  const moved = moveEquipment(layout, ep.rackId, ep.equipmentId, 'CAB-A02', 17);
  const target = { ...ep, rackId: 'CAB-A02' };
  assert.deepEqual(patchPortDetails(moved, target), patchPortDetails(layout, ep));
  assert.equal(portVlan(moved, target), 99); assert.equal(portVlan(moved, ep), null);
  assert.deepEqual(patchPortDetails(moved, neighbor), patchPortDetails(layout, neighbor));
  assert.equal(moved.cables.length, layout.cables.length);
  assert.deepEqual(moved.cables.find(c => c.id === 'CR-0018')!.from, target);
  assert.equal(estimateCable(moved, moved.cables.find(c => c.id === 'CR-0018')!, defaultCalibration).cross, false);
  assert.deepEqual(layout, before);
  const collision = structuredClone(layout);
  collision.racks[1].equipment.push({ ...resolveEndpoint(layout, ep).equipment, bottomU: 16 });
  assert.throws(() => moveEquipment(collision, ep.rackId, ep.equipmentId, 'CAB-A02', 17), /equipment ID/);
  assert.deepEqual(layout, before);
  assert.throws(() => moveEquipment(layout, ep.rackId, ep.equipmentId, 'CAB-A02', 42), /Overlaps/);
  assert.throws(() => moveEquipment(moved, 'CAB-A01', 'PP-A040', 'CAB-A02', 17), /Overlaps/);
  const sameRack = moveEquipment(moved, target.rackId, target.equipmentId, target.rackId, 16);
  assert.equal(resolveEndpoint(sameRack, target).equipment.bottomU, 16);
  assert.equal(portVlan(sameRack, target), 99);
  assert.equal(equipmentRemovalImpact(moved, target.rackId, target.equipmentId).cables.length, 1);
  const removed = removeEquipment(moved, target.rackId, target.equipmentId);
  assert.equal(removed.cables.length, layout.cables.length - 1);
  assert.equal(portVlan(removed, target), null);
  assert.equal(portVlan(removed, { rackId: 'CAB-A02', equipmentId: 'SW-B01', port: 18 }), 30);
  assert.deepEqual(patchPortDetails(removed, neighbor), patchPortDetails(layout, neighbor));
  const project = defaultProject(defaultConfiguration(), 'metric'); project.locations[0].layout = moved;
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
});

test('multi-unit equipment geometry preserves image proportions and moves every cable endpoint together', () => {
  const template = { ...importedPanel(), id: 'custom-two-unit', heightU: 2 };
  let layout = addEquipment({ ...fixtureLayout(), templates: [template] }, { rackId: 'CAB-A01', templateId: template.id, id: 'TALL', label: 'Tall panel', bottomU: 16 });
  const ep = { rackId: 'CAB-A01', equipmentId: 'TALL', port: 24 }, e = resolveEndpoint(layout, ep).equipment;
  const bounds = equipmentImageBounds(e, layout.templates);
  assert.ok(Math.abs(equipmentFace(e).height - (2 * UNIT - .5)) < 1e-9);
  assert.ok(Math.abs(bounds.width / bounds.height - template.imageWidth / template.imageHeight) < 1e-9);
  const point = portPoint(layout, ep, ['CAB-A01', 'CAB-A02']);
  assert.ok(point.y >= TOP + 25 * UNIT && point.y < TOP + 27 * UNIT);
  const cable = { id: 'UPLINK', from: ep, to: { rackId: 'CAB-A02', equipmentId: 'SW-B01', port: 48 }, vlan: 10, jacket: '#159de7' };
  const estimate = estimateCable(layout, cable, defaultCalibration);
  layout = moveEquipment(layout, ep.rackId, ep.equipmentId, ep.rackId, 14);
  assert.ok(Math.abs(portPoint(layout, ep, ['CAB-A01', 'CAB-A02']).y - point.y - 2 * UNIT) < 1e-9);
  assert.ok(Math.abs(estimateCable(layout, cable, defaultCalibration).requiredM - estimate.requiredM - 2 * .04445) < 1e-9);
  assert.deepEqual(cablePoints(layout, cable, ['CAB-A01', 'CAB-A02'])[0], portPoint(layout, ep, ['CAB-A01', 'CAB-A02']));
  // Arbitrary generic faces must expose every port if an image is deselected.
  for (const portCount of [1, 8, 24, 48, 52, 256]) {
    const generic = structuredClone(layout); Object.assign(generic.racks[0].equipment.find(e => e.id === 'TALL')!, { templateId: undefined, portCount });
    const positions = Array.from({ length: portCount }, (_, i) => portPoint(generic, { ...ep, port: i + 1 }, ['CAB-A01']));
    assert.equal(new Set(positions.map(p => `${p.x}/${p.y}`)).size, portCount);
    assert.ok(positions.every(p => Number.isFinite(p.x) && p.y >= TOP + 27 * UNIT && p.y < TOP + 29 * UNIT));
  }
});

test('empty racks and the final equipment removal remain valid saved projects', () => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  let layout = project.locations[0].layout;
  for (const rack of [...layout.racks]) for (const e of [...rack.equipment]) layout = removeEquipment(layout, rack.id, e.id);
  assert.equal(layout.racks.length, 2);
  assert.ok(layout.racks.every(r => !r.equipment.length));
  assert.equal(layout.cables.length, 0); assert.deepEqual(layout.portVlans, {});
  project.locations[0].layout = layout; assert.ok(parseProject(project));
  assert.ok(parseProject({ ...project, locations: [{ ...project.locations[0], layout: addEquipment(layout, { rackId: 'CAB-A01', templateId: 'netbox-ubiquiti-us-48', id: 'SW-001', label: 'Switch', bottomU: 42 }) }] }));
});


test('zero-based numbering maps each physical socket and route to the same position as one-based numbering', () => {
  const draft = { rackId: 'CAB-A01', templateId: 'netbox-ubiquiti-us-48', id: 'ZERO', label: 'Zero-based switch', bottomU: 17 };
  const one = addEquipment(fixtureLayout(), draft);
  const zero = addEquipment(fixtureLayout(), { ...draft, portStart: 0 });
  const equipment = resolveEndpoint(zero, { rackId: draft.rackId, equipmentId: draft.id, port: 0 }).equipment;
  assert.equal(firstPortNumber(equipment), 0);
  assert.deepEqual(portNumbers(equipment), Array.from({ length: 48 }, (_, i) => i));
  for (let index = 0; index < 48; index++) {
    const a = { rackId: draft.rackId, equipmentId: draft.id, port: index }, b = { ...a, port: index + 1 };
    assert.deepEqual(portPoint(zero, a, ['CAB-A01', 'CAB-A02']), portPoint(one, b, ['CAB-A01', 'CAB-A02']));
    assert.equal(endpointSide(zero, a), endpointSide(one, b));
    assert.deepEqual(templatePort(equipment, index), templatePort(resolveEndpoint(one, b).equipment, index + 1));
    const cable = { id: 'ZERO-CABLE', from: a, to: { rackId: 'CAB-A02', equipmentId: 'PP-B01', port: 24 }, vlan: 10, jacket: '#159de7' };
    assert.deepEqual(estimateCable(zero, cable, defaultCalibration), estimateCable(one, { ...cable, from: b }, defaultCalibration));
  }
  assert.throws(() => resolveEndpoint(zero, { rackId: draft.rackId, equipmentId: draft.id, port: -1 }));
  assert.throws(() => resolveEndpoint(zero, { rackId: draft.rackId, equipmentId: draft.id, port: 48 }));
  const genericZero = setEquipmentTemplate(zero, draft.rackId, draft.id, null);
  const genericOne = setEquipmentTemplate(one, draft.rackId, draft.id, null);
  for (const port of [0, 11, 12, 23, 24, 35, 36, 47]) {
    const a = { rackId: draft.rackId, equipmentId: draft.id, port }, b = { ...a, port: port + 1 };
    assert.deepEqual(portPoint(genericZero, a, ['CAB-A01']), portPoint(genericOne, b, ['CAB-A01']));
    assert.equal(endpointSide(genericZero, a), endpointSide(genericOne, b));
  }
});

test('a single port numbered zero supports notes, VLANs, connections, appearance changes, moves and backups', () => {
  const template: EquipmentTemplate = { ...importedPanel(), id: 'custom-single-port', name: 'Single port', portCount: 1, ports: [{ ...importedPanel().ports[0], name: 'Outlet 0' }] };
  let project = saveEquipmentTemplate(defaultProject(defaultConfiguration(), 'metric'), template);
  const ep = { rackId: 'CAB-A01', equipmentId: 'PP-ZERO', port: 0 };
  let layout = addEquipment(projectLayout(project, 'idf-01'), { rackId: ep.rackId, templateId: template.id, id: ep.equipmentId, label: 'Only port zero', bottomU: 17, portStart: 0 });
  assert.throws(() => resolveEndpoint(layout, { ...ep, port: 1 }));
  layout = assignPortVlans(layout, [ep], 99);
  layout = updatePatchPortsDetails(layout, [ep], { facilityLocation: 'Room zero', notes: 'Keep the first socket' });
  const cable = { id: 'FIRST-ZERO', from: ep, to: { rackId: 'CAB-A02', equipmentId: 'PP-B01', port: 1 }, vlan: 99, jacket: '#159de7' };
  assert.equal(connectionError(layout, cable), null);
  layout = { ...layout, cables: [...layout.cables, cable] };
  layout = setEquipmentTemplate(layout, ep.rackId, ep.equipmentId, null);
  assert.ok(Number.isFinite(portPoint(layout, ep, ['CAB-A01']).x));
  layout = setEquipmentTemplate(layout, ep.rackId, ep.equipmentId, template.id);
  layout = moveEquipment(layout, ep.rackId, ep.equipmentId, 'CAB-A02', 17);
  const moved = { ...ep, rackId: 'CAB-A02' };
  assert.equal(portVlan(layout, moved), 99);
  assert.equal(patchPortDetails(layout, moved).facilityLocation, 'Room zero');
  assert.equal(equipmentRemovalImpact(layout, moved.rackId, moved.equipmentId).cables.length, 1);
  const { templates: _catalog, ...saved } = layout; project.locations[0].layout = saved;
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
  const copied = upsertLocation(project, { name: 'IDF-Zero', type: 'IDF', building: 'Building A', floor: '', room: '', notes: '' }, undefined, 'idf-01');
  assert.equal(firstPortNumber(resolveEndpoint(copied.locations[1].layout, moved).equipment), 0);
  for (const bad of [-1, 1.5, 1000000, '0', null, false]) {
    const invalid = structuredClone(project);
    (invalid.locations[0].layout.racks[1].equipment.find(e => e.id === ep.equipmentId)! as unknown as { portStart: unknown }).portStart = bad;
    assert.equal(parseProject(invalid), null);
  }
  const wrongPort = structuredClone(project); wrongPort.locations[0].layout.cables.find(c => c.id === cable.id)!.from.port = 1;
  assert.equal(parseProject(wrongPort), null);
  const removed = removeEquipment(layout, moved.rackId, moved.equipmentId);
  assert.equal(portVlan(removed, moved), null); assert.equal(removed.cables.length, layout.cables.length - 1);
  assert.equal(parseProject(defaultProject(defaultConfiguration(), 'metric'))!.locations[0].layout.racks[0].equipment[0].portStart, undefined);
});

test('template numbering is inherited and editing it remaps all locations without losing socket data', () => {
  const template = importedPanel();
  let project = saveEquipmentTemplate(defaultProject(defaultConfiguration(), 'metric'), template);
  const ep = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 24 };
  let layout = setEquipmentTemplate(projectLayout(project, 'idf-01'), ep.rackId, ep.equipmentId, template.id);
  layout = assignPortVlans(layout, [{ ...ep, port: 1 }, ep], 99);
  layout = updatePatchPortsDetails(layout, [{ ...ep, port: 1 }], { notes: 'First socket' });
  layout = updatePatchPortsDetails(layout, [ep], { notes: 'Last socket' });
  const { templates: _catalog, ...saved } = layout; project.locations[0].layout = saved;
  project = upsertLocation(project, { name: 'IDF-02', type: 'IDF', building: 'Building A', floor: '', room: '', notes: '' }, undefined, 'idf-01');
  const before = structuredClone(project);
  project = saveEquipmentTemplate(project, { ...template, portStart: 0 });
  assert.ok(parseProject(project));
  assert.equal(firstPortNumber(resolveEndpoint(project.locations[1].layout, { ...ep, port: 0 }).equipment), 0);
  const changed = projectLayout(project, 'idf-01');
  assert.equal(patchPortDetails(changed, { ...ep, port: 0 }).notes, 'First socket');
  assert.equal(patchPortDetails(changed, { ...ep, port: 23 }).notes, 'Last socket');
  assert.equal(portVlan(changed, { ...ep, port: 23 }), 99);
  assert.equal(changed.portDetails![endpointKey(ep)], undefined);
  for (let i = 0; i < changed.cables.length; i++) {
    for (const side of ['from', 'to'] as const) {
      const old = saved.cables[i][side], next = changed.cables[i][side];
      assert.deepEqual(portPoint(layout, old, ['CAB-A01', 'CAB-A02']), portPoint(changed, next, ['CAB-A01', 'CAB-A02']));
      assert.equal(next.port, old.port - (old.rackId === ep.rackId && old.equipmentId === ep.equipmentId ? 1 : 0));
    }
  }
  const added = addEquipment(changed, { rackId: ep.rackId, templateId: template.id, id: 'PP-NEW', label: 'Inherited', bottomU: 17 });
  assert.equal(firstPortNumber(resolveEndpoint(added, { ...ep, equipmentId: 'PP-NEW', port: 0 }).equipment), 0);
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
  const restored = saveEquipmentTemplate(project, { ...template, portStart: 1 });
  assert.deepEqual(restored.locations[0].layout.cables, before.locations[0].layout.cables);
  assert.deepEqual(restored.locations[0].layout.portDetails, before.locations[0].layout.portDetails);
  assert.deepEqual(restored.locations[0].layout.portVlans, before.locations[0].layout.portVlans);
  assert.equal(before.templates![0].portStart, undefined);
  for (const invalid of [-1, 1.5, 1000000, null, false, '0']) assert.equal(validCustomTemplates([{ ...template, portStart: invalid }]), false);
});

// Physical media remains independent of VLANs and logical interface names.
import { getPortMedia, setPortsMedia, cableMediaError, type Cable } from '../src/model';
import { type PortMedia, type FiberStock, validPortMedia, inferPortMedia, defaultFiber, matchingFiberStock } from '../src/media';
const fiberPort: PortMedia = { kind: 'fiber', connector: 'LC', mode: 'single-mode', strands: 2 };
const fiberFrom = { rackId: 'CAB-A01', equipmentId: 'PP-A01', port: 1 };
const fiberTo = { rackId: 'CAB-A02', equipmentId: 'PP-B01', port: 1 };
const fiberCable: Cable = { id: 'FIBER-1', from: fiberFrom, to: fiberTo, vlan: 10, jacket: '#f3cf19', medium: 'fiber', fiber: defaultFiber() };
function fiberLayout() { return setPortsMedia({ ...fixtureLayout(), cables: [], portVlans: {} }, [fiberFrom, fiberTo], fiberPort); }

test('fiber validates media, connectors, modes, strand counts and installed optical modules', () => {
  const layout = fiberLayout();
  assert.equal(connectionError(layout, fiberCable), null);
  const { fiber: _fiber, ...rest } = fiberCable;
  assert.match(connectionError(layout, { ...rest, medium: 'copper' })!, /requires a fiber/);
  assert.match(connectionError(layout, { ...fiberCable, fiber: { ...defaultFiber(), mode: 'multimode' } })!, /mode/);
  assert.match(connectionError(layout, { ...fiberCable, fiber: { ...defaultFiber(), strands: 1 } })!, /strand/);
  assert.match(connectionError(layout, { ...fiberCable, fiber: { ...defaultFiber(), toConnector: 'SC' } })!, /connector/);
  const hybrid = setPortsMedia(layout, [fiberTo], { ...fiberPort, connector: 'SC' });
  assert.equal(connectionError(hybrid, { ...fiberCable, fiber: { ...defaultFiber(), toConnector: 'SC' } }), null);
  const empty = setPortsMedia(layout, [fiberFrom], { kind: 'sfp-plus' });
  assert.match(connectionError(empty, fiberCable)!, /installed transceiver/);
  const installed = setPortsMedia(empty, [fiberFrom], { ...fiberPort, kind: 'sfp-plus', transceiver: 'Optical module' });
  assert.equal(connectionError(installed, fiberCable), null);
  const copper = setPortsMedia(layout, [fiberFrom, fiberTo], { kind: 'sfp', connector: 'RJ45', transceiver: 'Copper module' });
  assert.equal(connectionError(copper, { ...rest, medium: 'copper' }), null);
  const unspecified = setPortsMedia(layout, [fiberFrom], { kind: 'fiber', connector: 'LC' });
  assert.match(connectionError(unspecified, fiberCable)!, /configure its fiber/);
});

test('physical bulk changes are atomic and follow moves, copies, removals and backup restoration', () => {
  let layout = fiberLayout();
  layout = { ...layout, cables: [fiberCable] };
  layout = setPatchPortDetails(layout, fiberFrom, { facilityLocation: 'MDF fiber shelf', notes: 'Duplex pair' });
  layout = assignPortVlan(layout, fiberFrom, 99);
  const before = structuredClone(layout);
  const unconnected = { ...fiberFrom, port: 2 };
  assert.throws(() => setPortsMedia(layout, [unconnected, fiberFrom], { kind: 'copper' }), /requires a copper/);
  assert.deepEqual(layout, before);
  assert.equal(getPortMedia(layout, unconnected).kind, 'copper');
  layout = moveEquipment(layout, fiberFrom.rackId, fiberFrom.equipmentId, 'CAB-A02', 17);
  const moved = { ...fiberFrom, rackId: 'CAB-A02' };
  assert.equal(getPortMedia(layout, moved).mode, 'single-mode');
  assert.equal(layout.portMedia![endpointKey(fiberFrom)], undefined);
  assert.equal(cableMediaError(layout, layout.cables[0]), null);
  let project = defaultProject(defaultConfiguration(), 'metric'); project.locations[0].layout = layout;
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
  project = upsertLocation(project, { name: 'Fiber copy', type: 'IDF', building: 'Building A', floor: '', room: '', notes: '' }, undefined, 'idf-01');
  assert.deepEqual(getPortMedia(project.locations[1].layout, moved), fiberPort);
  assert.equal(project.locations[1].layout.cables.length, 0);
  assert.equal(getPortMedia(setEquipmentTemplate(layout, moved.rackId, moved.equipmentId, 'netbox-generic-copper-24'), moved).kind, 'fiber');
  const removed = removeEquipment(layout, moved.rackId, moved.equipmentId);
  assert.equal(removed.portMedia![endpointKey(moved)], undefined);
  assert.equal(removed.cables.length, 0);
  assert.deepEqual(removeRack(layout, 'CAB-A02').portMedia, {});
});

test('mixed templates inherit media, renumber physical overrides, and reject incompatible live changes', () => {
  const panel = importedPanel();
  const template: EquipmentTemplate = { ...panel, portStart: 0, ports: panel.ports.map((p, i) => ({ ...p, media: i === 0 ? fiberPort : { kind: 'copper' } })) };
  let project = saveEquipmentTemplate(defaultProject(defaultConfiguration(), 'metric'), template);
  let layout = addEquipment(projectLayout(project, 'idf-01'), { id: 'MIXED', label: 'Mixed panel', rackId: 'CAB-A01', templateId: template.id, bottomU: 17 });
  const ep = { rackId: 'CAB-A01', equipmentId: 'MIXED', port: 0 };
  assert.equal(getPortMedia(layout, ep).kind, 'fiber');
  assert.equal(getPortMedia(layout, { ...ep, port: 1 }).kind, 'copper');
  layout = setPortsMedia(layout, [fiberTo], fiberPort);
  layout = setPortsMedia(layout, [{ ...ep, port: 1 }], { ...fiberPort, kind: 'sfp-plus', transceiver: 'Module record' });
  layout = { ...layout, cables: [{ ...fiberCable, from: ep }] };
  const { templates: _catalog, ...saved } = layout; project.locations[0].layout = saved;
  assert.ok(parseProject(project));
  assert.throws(() => saveEquipmentTemplate(project, { ...template, ports: template.ports.map(p => ({ ...p, media: { kind: 'copper' } })) }), /requires a copper/);
  const changed = saveEquipmentTemplate(project, { ...template, portStart: 1 });
  assert.equal(getPortMedia(projectLayout(changed, 'idf-01'), { ...ep, port: 2 }).transceiver, 'Module record');
  assert.equal(changed.locations[0].layout.cables[0].from.port, 1);
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(changed))), migrateFacilityLocations(changed));
  for (const invalid of [{ kind: 'invalid' }, { ...fiberPort, strands: 0 }, { ...fiberPort, mode: 'wrong' }, { ...fiberPort, connector: 'RJ45' }]) {
    const bad = structuredClone(changed); bad.locations[0].layout.portMedia![endpointKey(fiberTo)] = invalid as PortMedia;
    assert.equal(parseProject(bad), null);
  }
});

test('fiber stock recommendations match specifications and color independently of copper stock', () => {
  const stock: FiberStock = { ...defaultFiber(), toConnector: 'SC', lengthM: 30, jacket: '#f3cf19' };
  const cable = { ...fiberCable, fiber: { ...defaultFiber(), toConnector: 'SC' as const } };
  const layout = setPortsMedia(fiberLayout(), [fiberTo], { ...fiberPort, connector: 'SC' });
  const cal = { ...defaultCalibration, stockedLengthsM: [100], fiberStock: [stock, { ...stock, lengthM: 15 }, { ...stock, lengthM: 10, mode: 'multimode' as const }, { ...stock, lengthM: 10, jacket: '#ffffff' }] };
  assert.equal(estimateCable(layout, cable, cal).recommendedM, 15);
  assert.equal(estimateCable(layout, cable, { ...cal, fiberStock: [] }).recommendedM, null);
  assert.equal(matchingFiberStock({ ...cable, fiber: { ...cable.fiber, fromConnector: 'SC', toConnector: 'LC' } }, stock), true);
  assert.equal(matchingFiberStock({ ...cable, fiber: { ...cable.fiber, strands: 12 } }, stock), false);
  const config = { ...defaultConfiguration(), fiberStock: [stock] };
  assert.deepEqual(parseConfiguration(config), config);
  assert.equal(parseConfiguration({ ...config, fiberStock: [{ ...stock, lengthM: 0 }] }), null);
  assert.equal(parseConfiguration({ ...config, fiberStock: [{ ...stock, jacket: 'yellow' }] }), null);
  assert.equal(validPortMedia({ kind: 'sfp', connector: 'RJ45', mode: 'single-mode' }), false);
  assert.deepEqual(inferPortMedia('10gbase-x-sfpp'), { kind: 'sfp-plus' });
  assert.deepEqual(inferPortMedia('100gbase-x-qsfp28'), { kind: 'qsfp28' });
  assert.deepEqual(inferPortMedia('lc'), { kind: 'fiber', connector: 'LC' });
});

test('saved rack zoom accepts old projects and validates persisted scale without changing units', () => {
  const project = defaultProject(defaultConfiguration(), 'imperial');
  assert.equal(parseProject(project)!.preferences.rackZoom, undefined);
  for (const zoom of [.12, .75, 1, 2]) {
    project.preferences.rackZoom = zoom;
    assert.deepEqual(importProject(JSON.parse(JSON.stringify(project)))!.preferences, { lengthUnit: 'imperial', rackZoom: zoom });
  }
  for (const invalid of [0, -.2, 2.1, Infinity, NaN, 'fit', null]) {
    const bad = { ...project, preferences: { ...project.preferences, rackZoom: invalid } };
    assert.equal(parseProject(bad), null);
  }
  assert.equal(parseProject(project)!.preferences.singleRackZoom, undefined);
  for (const zoom of [.12, 1, 2.5, 8]) {
    project.preferences.singleRackZoom = zoom;
    assert.deepEqual(importProject(JSON.parse(JSON.stringify(project)))!.preferences, { lengthUnit: 'imperial', rackZoom: 2, singleRackZoom: zoom });
  }
  for (const invalid of [0, -.2, 8.1, Infinity, NaN, 'fit', null]) {
    assert.equal(parseProject({ ...project, preferences: { ...project.preferences, singleRackZoom: invalid } }), null);
  }
});

import { setEquipmentPortStart } from '../src/model';
import { MAX_PORT_NUMBER, validPortRange } from '../src/portNumbering';

test('custom ranges preserve every socket and record even when old and new ranges overlap', () => {
  const ep = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 1 };
  let layout = { ...fixtureLayout(), cables: [] as Cable[], portVlans: {} };
  const endpoints = Array.from({ length: 24 }, (_, i) => ({ ...ep, port: i + 1 }));
  layout = assignPortVlans(layout, endpoints, 99) as typeof layout;
  for (const endpoint of endpoints) layout = setPatchPortDetails(layout, endpoint, { facilityLocation: `Room ${endpoint.port}`, notes: `Socket ${endpoint.port}` }) as typeof layout;
  layout = setPortsMedia(layout, [{ ...ep, port: 24 }], fiberPort) as typeof layout;
  layout.cables = [
    { id: 'LOCAL', from: ep, to: { ...ep, port: 2 }, vlan: 99, jacket: '#159de7' },
    { id: 'CROSS', from: { ...ep, port: 18 }, to: { rackId: 'CAB-A02', equipmentId: 'PP-B01', port: 1 }, vlan: 99, jacket: '#159de7' },
  ];
  const before = structuredClone(layout);
  for (const start of [2, 25, 49, 0, MAX_PORT_NUMBER - 23]) {
    const next = setEquipmentPortStart(layout, ep.rackId, ep.equipmentId, start);
    for (const endpoint of endpoints) {
      const numbered = { ...endpoint, port: start + endpoint.port - 1 };
      assert.deepEqual(portPoint(next, numbered, ['CAB-A01', 'CAB-A02']), portPoint(layout, endpoint, ['CAB-A01', 'CAB-A02']));
      assert.deepEqual(patchPortDetails(next, numbered), patchPortDetails(layout, endpoint));
      assert.deepEqual(getPortMedia(next, numbered), getPortMedia(layout, endpoint));
      assert.equal(portVlan(next, numbered), 99);
    }
    assert.equal(next.cables[0].from.port, start); assert.equal(next.cables[0].to.port, start + 1);
    assert.equal(next.cables[1].from.port, start + 17); assert.equal(next.cables[1].to.port, 1);
    const project = defaultProject(defaultConfiguration(), 'metric'); project.locations[0].layout = next;
    assert.deepEqual(importProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
    assert.equal(Object.keys(next.portDetails!).length, 24);
    const reset = setEquipmentPortStart(next, ep.rackId, ep.equipmentId, null);
    assert.deepEqual(reset.cables, before.cables); assert.deepEqual(reset.portDetails, before.portDetails);
    assert.deepEqual(reset.portMedia, before.portMedia); assert.deepEqual(reset.portVlans, before.portVlans);
    assert.equal(resolveEndpoint(reset, ep).equipment.portStartOverride, undefined);
  }
  assert.deepEqual(layout, before);
  for (const invalid of [-1, .5, NaN, Infinity, MAX_PORT_NUMBER]) assert.throws(() => setEquipmentPortStart(layout, ep.rackId, ep.equipmentId, invalid), /whole starting/);
  assert.equal(validPortRange(MAX_PORT_NUMBER, 1), true);
});

test('per-device ranges survive shared template edits, copies and moves, then can resume inheritance', () => {
  const template = { ...importedPanel(), portStart: 25 };
  let project = saveEquipmentTemplate(defaultProject(defaultConfiguration(), 'metric'), template);
  let layout = projectLayout(project, 'idf-01');
  for (const [id, bottomU] of [['CUSTOM', 17], ['INHERITED', 16]] as const) layout = addEquipment(layout, { rackId: 'CAB-A01', templateId: template.id, id, label: id, bottomU });
  const ep = { rackId: 'CAB-A01', equipmentId: 'CUSTOM', port: 49 };
  layout = setEquipmentPortStart(layout, ep.rackId, ep.equipmentId, 49);
  const { templates: _catalog, ...saved } = layout; project.locations[0].layout = saved;
  project = upsertLocation(project, { name: 'Range copy', type: 'IDF', building: 'Building A', floor: '', room: '', notes: '' }, undefined, 'idf-01');
  project = saveEquipmentTemplate(project, { ...template, portStart: 73 });
  for (const location of project.locations) {
    assert.equal(firstPortNumber(resolveEndpoint(location.layout, ep).equipment), 49);
    assert.equal(firstPortNumber(resolveEndpoint(location.layout, { ...ep, equipmentId: 'INHERITED', port: 73 }).equipment), 73);
  }
  const inherited = setEquipmentPortStart(projectLayout(project, 'idf-01'), ep.rackId, ep.equipmentId, null);
  assert.equal(firstPortNumber(resolveEndpoint(inherited, { ...ep, port: 73 }).equipment), 73);
  const moved = moveEquipment(inherited, ep.rackId, ep.equipmentId, 'CAB-A02', 17);
  assert.equal(firstPortNumber(resolveEndpoint(moved, { ...ep, rackId: 'CAB-A02', port: 73 }).equipment), 73);
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
  const invalid = structuredClone(project);
  invalid.locations[0].layout.racks[0].equipment.find(e => e.id === 'CUSTOM')!.portStartOverride = 'yes' as unknown as boolean;
  assert.equal(parseProject(invalid), null);
  assert.equal(validCustomTemplates([{ ...template, portStart: MAX_PORT_NUMBER - 22 }]), false);
});

test('facility locations migrate free text, rename across archived views and protect assignments from deletion', () => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  const panel = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 18 };
  project.locations[0].layout = setPatchPortDetails(project.locations[0].layout, panel, { facilityLocation: 'West wing', notes: 'Outlet W18' });
  project.locations.push({ ...structuredClone(project.locations[0]), id: 'archived-idf', name: 'Archived IDF', archived: true });
  const original = structuredClone(project);
  const loaded = parseProject(project)!;
  assert.deepEqual(loaded.configuration.facilityLocations, [{ name: 'West wing', color: '#159de7' }]);
  assert.deepEqual(facilityLocationUsage(loaded, 'West wing'), { ports: 2, cables: 2 });
  assert.throws(() => removeFacilityLocation(loaded, 'West wing'), /reassign/);
  const renamed = saveFacilityLocation(loaded, { name: 'Reception', color: '#cc2255' }, 'West wing');
  for (const closet of renamed.locations) assert.deepEqual(patchPortDetails(closet.layout, panel), { facilityLocation: 'Reception', notes: 'Outlet W18' });
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(renamed))), renamed);
  assert.deepEqual(project, original);
  assert.throws(() => saveFacilityLocation(renamed, { name: ' reception ', color: '#159de7' }), /already exists/);
  for (const bad of [{ name: '', color: '#159de7' }, { name: 'A', color: 'bad' }, { name: 'x'.repeat(251), color: '#159de7' }]) {
    assert.equal(parseConfiguration({ ...defaultConfiguration(), facilityLocations: [bad] }), null);
  }
  const cleared = { ...renamed, locations: renamed.locations.map(l => ({ ...l, layout: assignPortLocations(l.layout, [panel], '', renamed.configuration.facilityLocations!) })) };
  assert.equal(removeFacilityLocation(cleared, 'Reception').configuration.facilityLocations!.length, 0);
  assert.equal(patchPortDetails(cleared.locations[0].layout, panel).notes, 'Outlet W18');
});

test('facility assignment batches work without cables on panels and switches, preserve metadata, and follow moves and ranges', () => {
  const catalog = [{ name: 'Lab', color: '#159de7' }];
  const panel = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 24 };
  const switchPort = { rackId: 'CAB-A01', equipmentId: 'SW-A01', port: 48 };
  let layout = setPatchPortDetails(fixtureLayout(), panel, { facilityLocation: '', notes: 'Keep this note' });
  const before = structuredClone(layout);
  assert.throws(() => assignPortLocations(layout, [panel, { ...switchPort, port: 49 }], 'Lab', catalog));
  assert.throws(() => assignPortLocations(layout, [panel], 'Missing', catalog), /configured/);
  assert.deepEqual(layout, before);
  layout = assignPortLocations(layout, [panel, switchPort], 'Lab', catalog);
  assert.deepEqual(layout.cables, before.cables);
  assert.deepEqual(layout.portVlans, before.portVlans);
  assert.equal(patchPortDetails(layout, panel).notes, 'Keep this note');
  const project = defaultProject({ ...defaultConfiguration(), facilityLocations: catalog }, 'metric');
  project.locations[0].layout = layout;
  assert.deepEqual(parseProject(project), project);
  layout = setEquipmentPortStart(layout, switchPort.rackId, switchPort.equipmentId, 0);
  const renumbered = { ...switchPort, port: 47 };
  assert.equal(patchPortDetails(layout, renumbered).facilityLocation, 'Lab');
  layout = moveEquipment(layout, 'CAB-A01', 'SW-A01', 'CAB-A02', 17);
  const moved = { ...renumbered, rackId: 'CAB-A02' };
  assert.equal(patchPortDetails(layout, moved).facilityLocation, 'Lab');
  layout = removeEquipment(layout, moved.rackId, moved.equipmentId);
  assert.equal(patchPortDetails(layout, moved).facilityLocation, '');
  assert.equal(patchPortDetails(layout, panel).facilityLocation, 'Lab');
});

test('location cable filters match either endpoint once, independently of VLAN assignments', () => {
  const catalog = [{ name: 'Office', color: '#159de7' }];
  const layout = fixtureLayout();
  const cable = layout.cables.find(c => c.id === 'CR-0018')!;
  for (const endpoints of [[cable.from], [cable.to], [cable.from, cable.to]]) {
    const assigned = assignPortLocations(layout, endpoints, 'Office', catalog);
    assert.deepEqual(assigned.cables.filter(c => cableAtLocation(assigned, c, 'Office')).map(c => c.id), ['CR-0018']);
  }
});

import { EMPTY_VIEW_FILTERS, portMatchesFilters, cableMatchesFilters, locationOutlineColor, vlanOutlineColor } from '../src/viewFilters';

test('view filters combine VLAN and location matches with OR and show no outlines for empty selections', () => {
  const lab = { name: 'Lab', color: '#cc2255' }, office = { name: 'Office', color: '#2288aa' };
  const catalog = [lab, office];
  let layout = fixtureLayout();
  const ten = layout.cables.find(c => c.vlan === 10)!;
  const twenty = layout.cables.find(c => c.vlan === 20)!;
  const spare = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 24 };
  layout = assignPortLocations(layout, [ten.from, twenty.to, spare], lab.name, catalog);
  layout = assignPortLocations(layout, [twenty.from], office.name, catalog);
  assert.ok(!portMatchesFilters(layout, spare, EMPTY_VIEW_FILTERS));
  assert.ok(cableMatchesFilters(layout, ten, EMPTY_VIEW_FILTERS));
  const both = { vlans: [10, 20], locations: ['Lab', 'Office'] };
  assert.ok(cableMatchesFilters(layout, ten, both));
  assert.ok(cableMatchesFilters(layout, twenty, both));
  assert.equal(layout.cables.filter(c => cableMatchesFilters(layout, c, both)).length, layout.cables.filter(c => c.vlan === 10 || c.vlan === 20).length);
  assert.ok(portMatchesFilters(layout, spare, both));
  assert.ok(portMatchesFilters(layout, spare, { vlans: [null], locations: ['Lab'] }));
  assert.ok(!cableMatchesFilters(layout, ten, { vlans: [null], locations: [] }));
  assert.ok(cableMatchesFilters(layout, ten, { vlans: [20], locations: ['Lab'] }));
  assert.ok(cableMatchesFilters(layout, ten, { vlans: [10], locations: ['Office'] }));
  assert.ok(cableMatchesFilters(layout, twenty, { vlans: [20], locations: ['Office'] }));
  assert.equal(locationOutlineColor(layout, spare, { vlans: [], locations: ['Lab', 'Office'] }, catalog), lab.color);
  assert.equal(locationOutlineColor(layout, twenty.from, both, catalog), office.color);
  assert.equal(locationOutlineColor(layout, spare, both, catalog), lab.color);
  assert.equal(locationOutlineColor(layout, ten.from, { vlans: [10], locations: ['Office'] }, catalog), null);
  assert.equal(vlanOutlineColor(layout, ten.from, EMPTY_VIEW_FILTERS), null);
  assert.equal(vlanOutlineColor(layout, ten.from, both), '#159de7');
  assert.equal(vlanOutlineColor(layout, spare, { vlans: [null], locations: [] }), '#91a4b5');
  assert.equal(locationOutlineColor(layout, spare, EMPTY_VIEW_FILTERS, catalog), null);
  const blank = { ...spare, port: 23 };
  assert.ok(portMatchesFilters(layout, blank, { vlans: [null], locations: [''] }));
  assert.equal(locationOutlineColor(layout, blank, { vlans: [], locations: [''] }, catalog), '#91a4b5');
  // Cable VLANs and port VLANs remain independent when filtering.
  layout = assignPortVlan(layout, ten.from, 99);
  assert.ok(cableMatchesFilters(layout, ten, { vlans: [10], locations: [] }));
  assert.ok(!portMatchesFilters(layout, ten.from, { vlans: [10], locations: [] }));
});

test('connection data honors custom ranges, frame calibration, shared stock and independent port VLANs', () => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  const frame = project.locations[0];
  const cable = frame.layout.cables[0];
  frame.layout.racks[0].label = 'Core rack';
  frame.layout = setEquipmentPortStart(frame.layout, cable.from.rackId, cable.from.equipmentId, 101);
  const from = frame.layout.cables[0].from;
  frame.layout.portVlans![endpointKey(from)] = 99;
  frame.layout.portDetails = { [endpointKey(from)]: { facilityLocation: 'Room 101', notes: 'Review outlet' } };
  project.configuration.stockedLengthsM = [100];
  project.locations.push({ ...structuredClone(frame), id: 'second', name: 'Second frame', calibration: { ...frame.calibration, slackM: frame.calibration.slackM + 10 } });
  const rows = connectionRows(project), original = rows[0], copy = rows[32];
  assert.equal(rows.length, 64);
  assert.equal(original.from.rack, 'Core rack');
  assert.equal(original.from.port, 103);
  assert.equal(original.from.vlan, '99 — Servers');
  assert.equal(original.vlan, '10 — Management');
  assert.equal(original.from.notes, 'Review outlet');
  assert.equal(original.stock, 100);
  assert.ok(Math.abs(copy.estimated - original.estimated - 10) < 1e-10);
  assert.notEqual(original.key, copy.key);
  const before = JSON.stringify(project);
  connectionsCsv(rows, 'imperial');
  assert.equal(JSON.stringify(project), before);
});

test('connection table uses compatible fiber stock and exports feet with safe multiline CSV fields', () => {
  const project = defaultProject(defaultConfiguration(), 'imperial');
  const frame = project.locations[0];
  frame.layout = { ...fiberLayout(), cables: [fiberCable] };
  frame.layout.portDetails = { [endpointKey(fiberFrom)]: { facilityLocation: 'Area, "North"', notes: '=SUM(1,2)\nSecond line' } };
  project.configuration.stockedLengthsM = [100];
  project.configuration.fiberStock = [{ ...defaultFiber(), jacket: fiberCable.jacket, lengthM: 30 }];
  const rows = connectionRows(project);
  assert.equal(rows[0].stock, 30);
  assert.match(rows[0].media, /Fiber.*Single-mode.*LC–LC/);
  const csv = connectionsCsv(rows, 'imperial');
  assert.ok(csv.startsWith('\uFEFF"Building"'));
  assert.ok(csv.includes('"Stock length (ft)"'));
  assert.ok(csv.includes('"98.43"'));
  assert.ok(csv.includes('"Area, ""North"""'));
  assert.ok(csv.includes('"\'=SUM(1,2)\nSecond line"'));
  project.configuration.fiberStock = [{ ...defaultFiber(), jacket: '#ffffff', lengthM: 30 }];
  assert.equal(connectionRows(project)[0].stock, null);
});

test('inventory reports every equipment port and both ends of cables, including empty racks and duplicate frame IDs', () => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  const frame = project.locations[0];
  const racks = inventoryRows(project, 'racks'), ports = inventoryRows(project, 'ports');
  assert.equal(racks.length, 50);
  assert.equal(ports.length, 1440);
  assert.equal(ports.filter(p => p.status === 'Connected').length, 64);
  assert.equal(racks.reduce((total, row) => total + (row.connectedPorts ?? 0), 0), 64);
  const crossFrom = ports.find(p => p.key === 'idf-01/CAB-A01/PP-A04/18')!;
  const crossTo = ports.find(p => p.key === 'idf-01/CAB-A02/SW-B01/18')!;
  assert.equal(crossFrom.peer, 'Rack B / SW-B01 / Port 18');
  assert.equal(crossTo.peer, 'Rack A / PP-A04 / Port 18');
  frame.layout.racks.push({ ...makeRack(2), equipment: [] });
  project.locations.push({ ...structuredClone(frame), id: 'archived-frame', name: 'Archived', archived: true });
  const allRacks = inventoryRows(project, 'racks'), allPorts = inventoryRows(project, 'ports');
  assert.equal(allRacks.length, 102);
  assert.equal(allRacks.filter(row => !row.equipmentKey).length, 2);
  assert.equal(allPorts.length, 2880);
  assert.equal(new Set(allPorts.map(row => row.key)).size, 2880);
  assert.equal(allRacks.find(row => row.rackKey === 'idf-01/CAB-A03')!.rackUsed, 0);
});

test('inventory preserves port zero, mapped interface names and unconnected VLANs, media and notes', () => {
  const panel = importedPanel();
  const template: EquipmentTemplate = { ...panel, portStart: 0, ports: panel.ports.map((p, i) => ({ ...p, name: `front/${i}`, media: i === 0 ? fiberPort : { kind: 'copper' } })) };
  const project = saveEquipmentTemplate(defaultProject(defaultConfiguration(), 'metric'), template);
  project.locations[0].layout = addEquipment(projectLayout(project, 'idf-01'), { id: 'MIXED', label: 'Custom panel', rackId: 'CAB-A01', templateId: template.id, bottomU: 17 });
  project.locations[0].layout.portVlans!['CAB-A01/MIXED/0'] = 99;
  project.locations[0].layout.portDetails = { 'CAB-A01/MIXED/0': { facilityLocation: 'Room 202', notes: 'Spare fiber' } };
  const before = JSON.stringify(project);
  const rows = inventoryRows(project, 'ports');
  const port = rows.find(row => row.key === 'idf-01/CAB-A01/MIXED/0')!;
  assert.equal(port.port, 0);
  assert.equal(port.sourceInterface, 'front/0');
  assert.equal(port.status, 'Available');
  assert.equal(port.peer, '');
  assert.equal(port.vlan, '99 — Servers');
  assert.equal(port.notes, 'Spare fiber');
  assert.match(port.media, /Fiber port.*LC.*Single-mode/);
  assert.equal(rows.filter(row => row.equipmentKey === port.equipmentKey).length, template.portCount);
  assert.equal(JSON.stringify(project), before);
});

const testStack: SwitchStack = { id: 'access-stack', name: 'Access stack', managementAddress: '192.0.2.10', interfaceNaming: 'juniper' };
const firstStackSwitch = { rackId: 'CAB-A01', templateId: 'custom-test-juniper', id: 'SW-001', label: 'Access', bottomU: 17 };
test('old empty stack names can be reused without replacing an active stack', () => {
  const original = saveStack(projectLayout(stackProject(), 'idf-01'), testStack);
  const before = JSON.stringify(original);
  const replacement = { ...testStack, id: 'replacement-stack', name: '  ACCESS STACK  ' };
  const rows = planStackMembers(original, firstStackSwitch, 2, 1);
  const next = createStackEquipment(original, replacement, rows);
  assert.deepEqual(next.stacks?.map(s => s.id), ['replacement-stack']);
  assert.equal(next.stacks![0].name, 'ACCESS STACK');
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(next.cables, original.cables);
  assert.deepEqual(next.portVlans, original.portVlans);
  assert.doesNotThrow(() => assertStackLayout(next));
  assert.throws(() => saveStack(next, { ...testStack, id: 'another-stack' }), /already used by Rack A \/ Access-1/);
  assert.equal(next.stacks![0].id, 'replacement-stack');
});

test('last member removal releases stack names while partial removal retains the group', () => {
  let layout = saveStack(projectLayout(stackProject(), 'idf-01'), testStack);
  layout = setEquipmentStack(layout, 'CAB-A01', 'SW-A01', testStack.id, 1);
  layout = setEquipmentStack(layout, 'CAB-A02', 'SW-B01', testStack.id, 2);
  const one = removeEquipment(layout, 'CAB-A01', 'SW-A01');
  assert.equal(one.stacks?.length, 1);
  assert.deepEqual(removeEquipment(one, 'CAB-A02', 'SW-B01').stacks, []);
  const rackRemoved = removeRack(layout, 'CAB-A01');
  assert.equal(rackRemoved.stacks?.length, 1);
  assert.deepEqual(removeRack(rackRemoved, 'CAB-A02').stacks, []);
  assert.deepEqual(setEquipmentStack(one, 'CAB-A02', 'SW-B01', null).stacks, []);
  const other = { ...testStack, id: 'other-stack', name: 'Other' };
  const moved = setEquipmentStack(saveStack(one, other), 'CAB-A02', 'SW-B01', other.id, 1);
  assert.deepEqual(moved.stacks?.map(s => s.id), [other.id]);
  assert.deepEqual(moved.cables, one.cables);
  assert.deepEqual(moved.portVlans, one.portVlans);
  assert.equal(layout.stacks?.length, 1);
});

test('stack creation previews available positions and creates clean switches atomically', () => {
  const project = stackProject(), layout = projectLayout(project, 'idf-01');
  const members = planStackMembers(layout, firstStackSwitch, 4, 0);
  assert.deepEqual(members.map(m => m.bottomU), [17, 16, 15, 14]);
  assert.deepEqual(members.map(m => m.member), [0, 1, 2, 3]);
  assert.deepEqual(members.map(m => m.label), ['Access-0', 'Access-1', 'Access-2', 'Access-3']);
  for (const label of ['BBY01320N023', 'BBY01320N023-1']) {
    assert.deepEqual(planStackMembers(layout, { ...firstStackSwitch, label }, 8, 1).map(m => m.label),
      Array.from({ length: 8 }, (_, i) => `BBY01320N023-${i + 1}`));
  }
  const original = JSON.stringify(layout);
  const next = createStackEquipment(layout, testStack, members);
  assert.equal(next.racks[0].equipment.length, layout.racks[0].equipment.length + 4);
  assert.equal(JSON.stringify(layout), original);
  assert.deepEqual(next.cables, layout.cables);
  assert.deepEqual(next.portVlans, layout.portVlans);
  for (const m of members) {
    const equipment = resolveEndpoint(next, { rackId: m.rackId, equipmentId: m.id, port: 0 }).equipment;
    assert.equal(interfaceName(next, equipment, 23), `ge-${m.member}/0/23`);
  }
  assert.equal(nextStackMember(next, testStack.id), 4);
  const { templates: _catalog, ...saved } = next;
  project.locations[0].layout = saved;
  assert.ok(parseProject(project));
  assert.deepEqual(importProject(JSON.parse(JSON.stringify(project))), migrateFacilityLocations(project));
  const copied = upsertLocation(project, { name: 'Copy', building: 'Building A', type: 'IDF', floor: '', room: '', notes: '' }, undefined, 'idf-01');
  assert.ok(parseProject(copied));
  assert.equal(copied.locations[1].layout.stacks![0].name, 'Access stack');
  assert.equal(copied.locations[1].layout.cables.length, 0);
});

test('stack preview flags insufficient space and supports mixed templates and racks without partial writes', () => {
  const project = stackProject(), layout = projectLayout(project, 'idf-01');
  const rows = planStackMembers(layout, { ...firstStackSwitch, bottomU: 1 }, 3, 0);
  assert.deepEqual(rows.map(r => r.bottomU), [1, 0, 0]);
  const before = JSON.stringify(layout);
  assert.throws(() => createStackEquipment(layout, testStack, rows), /bottom rack unit/);
  assert.equal(JSON.stringify(layout), before);
  rows[1] = { ...rows[1], rackId: 'CAB-A02', bottomU: 17 };
  rows[2] = { ...rows[2], rackId: 'CAB-A02', templateId: 'custom-test-juniper-2u', bottomU: 15 };
  const next = createStackEquipment(layout, testStack, rows);
  assert.equal(next.racks[1].equipment.find(e => e.id === rows[2].id)!.heightU, 2);
  assert.throws(() => createStackEquipment(layout, testStack, rows.map((r, i) => i === 2 ? { ...r, member: 1 } : r)), /already assigned/);
  assert.throws(() => createStackEquipment(layout, testStack, rows.map((r, i) => i === 2 ? { ...r, bottomU: 17 } : r)), /Overlaps/);
  assert.throws(() => planStackMembers(layout, firstStackSwitch, 4, 254), /Member numbers/);
  assert.throws(() => planStackMembers(layout, firstStackSwitch, 0, 0), /members/);
  assert.equal(JSON.stringify(layout), before);
});

test('stack membership renumbering and moving preserve cable endpoints and all port records', () => {
  const project = stackProject();
  let layout = projectLayout(project, 'idf-01');
  layout = setEquipmentTemplate(layout, 'CAB-A01', 'SW-A01', 'custom-test-juniper');
  layout = saveStack(layout, testStack);
  layout = setEquipmentStack(layout, 'CAB-A01', 'SW-A01', testStack.id, 0);
  const before = JSON.stringify({ cables: layout.cables, vlans: layout.portVlans, details: layout.portDetails, media: layout.portMedia });
  const renamed = setEquipmentStack(layout, 'CAB-A01', 'SW-A01', testStack.id, 3);
  assert.equal(JSON.stringify({ cables: renamed.cables, vlans: renamed.portVlans, details: renamed.portDetails, media: renamed.portMedia }), before);
  assert.equal(interfaceName(renamed, resolveEndpoint(renamed, { rackId: 'CAB-A01', equipmentId: 'SW-A01', port: 24 }).equipment, 24), 'ge-3/0/23');
  const moved = moveEquipment(renamed, 'CAB-A01', 'SW-A01', 'CAB-A02', 17);
  assert.equal(resolveEndpoint(moved, { rackId: 'CAB-A02', equipmentId: 'SW-A01', port: 24 }).equipment.stack!.member, 3);
  assert.doesNotThrow(() => assertStackLayout(moved));
  const detached = setEquipmentStack(moved, 'CAB-A02', 'SW-A01', null);
  assert.equal(interfaceName(detached, resolveEndpoint(detached, { rackId: 'CAB-A02', equipmentId: 'SW-A01', port: 24 }).equipment, 24), 'ge-0/0/23');
  assert.doesNotThrow(() => assertStackLayout(removeEquipment(moved, 'CAB-A02', 'SW-A01')));
  assert.doesNotThrow(() => assertStackLayout(removeRack(moved, 'CAB-A02')));
});

test('Cisco StackWise naming substitutes the stack member in C9300 interface names', () => {
  const project = stackProject();
  const names = ['GigabitEthernet1/0/1', 'TenGigabitEthernet1/1/1', 'TwentyFiveGigE1/0/1', 'HundredGigE1/0/1.20', 'Loopback0'];
  project.templates![0].ports = project.templates![0].ports.map((port, index) => ({ ...port, name: names[index] ?? port.name }));
  let layout = projectLayout(project, 'idf-01');
  const stack: SwitchStack = { ...testStack, interfaceNaming: 'cisco' };
  layout = setEquipmentTemplate(layout, 'CAB-A01', 'SW-A01', 'custom-test-juniper');
  layout = saveStack(layout, stack);
  layout = setEquipmentStack(layout, 'CAB-A01', 'SW-A01', stack.id, 2);
  const equipment = resolveEndpoint(layout, { rackId: 'CAB-A01', equipmentId: 'SW-A01', port: 1 }).equipment;
  assert.deepEqual([1, 2, 3, 4, 5].map(port => interfaceName(layout, equipment, port)), [
    'GigabitEthernet2/0/1', 'TenGigabitEthernet2/1/1', 'TwentyFiveGigE2/0/1', 'HundredGigE2/0/1.20', 'Loopback0',
  ]);
  assert.equal(project.templates![0].ports[0].name, 'GigabitEthernet1/0/1');
});

test('stack project validation rejects invalid references, duplicate members, and panel membership', () => {
  const project = stackProject();
  const { templates: _catalog, ...layout } = createStackEquipment(projectLayout(project, 'idf-01'), testStack, planStackMembers(projectLayout(project, 'idf-01'), firstStackSwitch, 2, 0));
  project.locations[0].layout = layout;
  const mutations = [
    (p: typeof project) => { p.locations[0].layout.stacks = [] },
    (p: typeof project) => { p.locations[0].layout.stacks!.push({ ...testStack, id: 'another' }) },
    (p: typeof project) => { p.locations[0].layout.racks[0].equipment.find(e => e.id === 'SW-002')!.stack!.member = 0 },
    (p: typeof project) => { p.locations[0].layout.racks[0].equipment[0].stack = { stackId: testStack.id, member: 2 } },
    (p: typeof project) => { p.locations[0].layout.racks[0].equipment.find(e => e.id === 'SW-001')!.stack!.member = -1 },
  ];
  for (const mutate of mutations) { const bad = structuredClone(project); mutate(bad); assert.equal(parseProject(bad), null); }
  const sourceNames = ['xe-0/2/3:1', 'et-0/1/0', 'mge-0/0/5', 'me0', 'Ethernet1/23'];
  project.templates![0].ports = project.templates![0].ports.map((p, i) => ({ ...p, name: sourceNames[i] ?? p.name }));
  const current = projectLayout(project, 'idf-01'), equipment = current.racks[0].equipment.find(e => e.id === 'SW-002')!;
  assert.deepEqual([0, 1, 2, 3, 4].map(port => interfaceName(current, equipment, port)), ['xe-1/2/3:1', 'et-1/1/0', 'mge-1/0/5', 'me0', 'Ethernet1/23']);
  assert.equal(project.templates![0].ports[0].name, 'xe-0/2/3:1');
});
