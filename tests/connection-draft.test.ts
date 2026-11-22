import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredCableColors, configuredDefaultCableColor, defaultConfiguration, parseConfiguration } from '../src/configuration';
import { deriveConnection } from '../src/connectionDraft';
import { defaultProject, importProject } from '../src/project';
import { fixtureLayout, endpointKey, connectionError, type Cable } from '../src/model';

test('default cable colors validate and fall back to blue for older configurations', () => {
  const configuration = defaultConfiguration();
  assert.equal(configuredDefaultCableColor(configuration), '#159de7');
  delete configuration.defaultCableColor;
  assert.equal(configuredDefaultCableColor(configuration), '#159de7');
  const saved = parseConfiguration({ ...configuration, defaultCableColor: '#9B59B6' })!;
  assert.equal(configuredDefaultCableColor(saved), '#9b59b6');
  assert.equal(saved.defaultCableColor, '#9b59b6');
  for (const bad of ['blue', 99, null]) assert.equal(parseConfiguration({ ...configuration, defaultCableColor: bad }), null);
  assert.equal(configuredDefaultCableColor({ ...configuration, cableColors: [] }), '');
  assert.equal(configuredDefaultCableColor({ ...configuration, cableColors: [{ name: 'Custom', color: '#123456' }] }), '#123456');
});

test('connection settings derive from ports, supporting unassigned and differing VLANs without overwriting ports', () => {
  const layout = fixtureLayout();
  const initial = layout.cables.find(cable => cable.id === 'CR-0018')!;
  layout.portVlans![endpointKey(initial.to)] = 99;
  assert.equal(deriveConnection(layout, initial).vlan, 99);
  const spare = { rackId: 'CAB-A01', equipmentId: 'SW-A01', port: 48 };
  // Repatching ignores the panel's previous inherited VLAN.
  const repatched = deriveConnection(layout, { ...initial, to: spare });
  assert.equal(repatched.vlan, null);
  const switchLink = deriveConnection(layout, { ...initial, from: initial.to, to: spare });
  assert.equal(switchLink.vlan, null);
  layout.portVlans![endpointKey(spare)] = 99;
  assert.equal(deriveConnection(layout, switchLink).vlan, 99);
  const snapshot = structuredClone(layout);
  deriveConnection(layout, initial);assert.deepEqual(layout, snapshot);
});

test('medium and fiber details come from ports and incompatible pairs are rejected', () => {
  const layout = fixtureLayout();
  const cable = layout.cables.find(cable => cable.id === 'CR-0018')!;
  layout.portMedia = {
    [endpointKey(cable.from)]: { kind: 'fiber', connector: 'LC', mode: 'single-mode', strands: 2 },
    [endpointKey(cable.to)]: { kind: 'fiber', connector: 'SC', mode: 'single-mode', strands: 2 },
  };
  const fiber = deriveConnection(layout, cable);
  assert.equal(fiber.medium, 'fiber');
  assert.deepEqual(fiber.fiber, { fromConnector: 'LC', toConnector: 'SC', mode: 'single-mode', strands: 2 });
  assert.equal(connectionError(layout, fiber), null);
  layout.portMedia[endpointKey(cable.to)].mode = 'multimode';
  assert.match(connectionError(layout, deriveConnection(layout, fiber))!, /fiber mode/);
  layout.portMedia = {};
  const copper = deriveConnection(layout, fiber);
  assert.equal(copper.medium, 'copper');assert.equal(copper.fiber, undefined);
});

test('unassigned connections round-trip with no VLAN catalog and configured colors validate', () => {
  const config = defaultConfiguration();config.vlans = [];config.cableColors = [{ name: 'Site blue', color: '#123456' }];
  const project = defaultProject(config, 'metric');
  const layout = project.locations[0].layout;
  const cable: Cable = { id: 'CBL-0001', from: { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 1 }, to: { rackId: 'CAB-A01', equipmentId: 'SW-A01', port: 1 }, vlan: null, jacket: '#123456' };
  layout.cables = [deriveConnection(layout, cable)];
  assert.equal(connectionError(layout, layout.cables[0], []), null);
  assert.ok(importProject(JSON.parse(JSON.stringify(project))));
  assert.deepEqual(configuredCableColors(config), config.cableColors);
  assert.ok(parseConfiguration({ ...config, cableColors: [] }));
  for (const colors of [[{ name: '', color: '#123456' }], [{ name: 'X', color: 'bad' }], [...config.cableColors, ...config.cableColors]]) assert.equal(parseConfiguration({ ...config, cableColors: colors }), null);
  assert.ok(configuredCableColors(defaultConfiguration()).length > 0);
  config.fiberStock = [{ fromConnector: 'LC', toConnector: 'LC', mode: 'single-mode', strands: 2, lengthM: 3, jacket: '#fedcba' }];
  assert.ok(configuredCableColors(config).some(color => color.color === '#fedcba'));
});
