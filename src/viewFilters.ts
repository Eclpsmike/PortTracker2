import { type Cable, type Endpoint, type Layout, type Vlan, portVlan, vlanColor } from './model';
import { portLocation } from './facilityLocations';
import type { FacilityLocation } from './configuration';

export interface ViewFilters { vlans: readonly (number | null)[]; locations: readonly string[] }
export const EMPTY_VIEW_FILTERS: ViewFilters = { vlans: [], locations: [] };
export function portMatchesFilters(layout: Layout, ep: Endpoint, filters: ViewFilters): boolean {
  return filters.vlans.includes(portVlan(layout, ep))
    || filters.locations.includes(portLocation(layout, ep));
}
export function cableMatchesFilters(layout: Layout, cable: Cable, filters: ViewFilters): boolean {
  // With no highlights selected, cable visibility is controlled by the Cables switch.
  return (!filters.vlans.length && !filters.locations.length) || filters.vlans.includes(cable.vlan)
    || [cable.from, cable.to].some(ep => filters.locations.includes(portLocation(layout, ep)));
}
export function locationOutlineColor(layout: Layout, ep: Endpoint, filters: ViewFilters, catalog: readonly FacilityLocation[]): string | null {
  if (!filters.locations.includes(portLocation(layout, ep))) return null;
  return catalog.find(l => l.name === portLocation(layout, ep))?.color ?? '#91a4b5';
}
export function vlanOutlineColor(layout: Layout, ep: Endpoint, filters: ViewFilters, catalog?: readonly Vlan[]): string | null {
  const assigned = portVlan(layout, ep);
  return filters.vlans.includes(assigned) ? assigned === null ? '#91a4b5' : vlanColor(assigned, catalog) : null;
}
