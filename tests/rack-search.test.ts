import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureLayout, endpointKey } from '../src/model';
import { rackPortLabel, searchRacks } from '../src/rackSearch';

test('rack search finds prefixed ports, inherited locations and notes, prioritizing exact names', () => {
  const layout = fixtureLayout();
  const cable = layout.cables.find(c => c.id === 'CR-0018')!;
  layout.portDetails = { [endpointKey(cable.from)]: { facilityLocation: 'Office 202', notes: 'North wall' } };
  assert.deepEqual(searchRacks(layout, '  '), []);
  assert.deepEqual(searchRacks(layout, 'no such device exists'), []);
  assert.equal(searchRacks(layout, 'sw-b01')[0].key, 'equipment/CAB-A02/SW-B01');
  assert.equal(searchRacks(layout, 'cr-0018')[0].target.kind, 'connection');
  assert.ok(searchRacks(layout, ' b090 ', 'B').some(result => result.key === `port/${endpointKey(cable.from)}`));
  assert.ok(searchRacks(layout, 'office 202').some(result => result.key === `port/${endpointKey(cable.to)}`));
  assert.ok(searchRacks(layout, 'north wall').some(result => result.key === `port/${endpointKey(cable.from)}`));
  const equipment = layout.racks[0].equipment.find(e => e.id === 'PP-A04')!;
  equipment.firstNumber = 101;
  assert.equal(rackPortLabel(layout, { ...cable.from, port: 1 }, 'B'), 'B101');
  assert.ok(searchRacks(layout, 'b101', 'B').some(result => result.key === 'port/CAB-A01/PP-A04/1'));
  equipment.portStartOverride = true;
  assert.equal(rackPortLabel(layout, { ...cable.from, port: 1 }, 'B'), 'B001');
});
