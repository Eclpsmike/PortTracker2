import { type FacilityLocation, facilityLocationError } from './configuration';
import { type Cable, type Endpoint, type Layout, endpointKey, patchPortDetails, resolveEndpoint } from './model';
import type { Project } from './project';

export const portLocation = (layout: Layout, endpoint: Endpoint) => patchPortDetails(layout, endpoint).facilityLocation;
export const cableAtLocation = (layout: Layout, cable: Cable, name: string) => [cable.from, cable.to].some(ep => portLocation(layout, ep) === name);

export function assignPortLocations(layout: Layout, endpoints: readonly Endpoint[], name: string, catalog: readonly FacilityLocation[]): Layout {
  for (const ep of endpoints) resolveEndpoint(layout, ep);
  if (name && !catalog.some(l => l.name === name)) throw new Error('Choose a configured facility location.');
  const portDetails = { ...layout.portDetails };
  for (const ep of endpoints) {
    const value = { ...patchPortDetails(layout, ep), facilityLocation: name };
    if (!value.facilityLocation && !value.notes) delete portDetails[endpointKey(ep)];
    else portDetails[endpointKey(ep)] = value;
  }
  return { ...layout, portDetails };
}

// Older projects stored free-text locations on ports. Keep those assignments and
// promote their names into the shared catalog when loading or importing a project.
export function migrateFacilityLocations(project: Project): Project {
  const catalog = [...(project.configuration.facilityLocations ?? [])];
  const names = new Map(catalog.map(l => [l.name.toLowerCase(), l.name]));
  const locations = project.locations.map(closet => {
    if (!closet.layout.portDetails) return closet;
    const portDetails = Object.fromEntries(Object.entries(closet.layout.portDetails).map(([key, details]) => {
      const name = details.facilityLocation.trim();
      let canonical = names.get(name.toLowerCase());
      if (name && !canonical) {
        canonical = name;
        names.set(name.toLowerCase(), name);
        catalog.push({ name, color: '#159de7' });
      }
      return [key, { ...details, facilityLocation: canonical ?? '' }];
    }));
    return { ...closet, layout: { ...closet.layout, portDetails } };
  });
  return { ...project, locations, configuration: { ...project.configuration, facilityLocations: catalog } };
}

export function facilityLocationUsage(project: Project, name: string) {
  return project.locations.reduce((total, closet) => ({
    ports: total.ports + Object.values(closet.layout.portDetails ?? {}).filter(d => d.facilityLocation === name).length,
    cables: total.cables + closet.layout.cables.filter(c => cableAtLocation(closet.layout, c, name)).length,
  }), { ports: 0, cables: 0 });
}

export function saveFacilityLocation(project: Project, value: FacilityLocation, previousName?: string): Project {
  const catalog = project.configuration.facilityLocations ?? [];
  if (previousName !== undefined && !catalog.some(l => l.name === previousName)) throw new Error('Choose an existing location.');
  const error = facilityLocationError(value, catalog, previousName);
  if (error) throw new Error(error);
  const saved = { ...value, name: value.name.trim() };
  return { ...project,
    configuration: { ...project.configuration, facilityLocations: [...catalog.filter(l => l.name !== previousName), saved].sort((a, b) => a.name.localeCompare(b.name)) },
    locations: project.locations.map(closet => !closet.layout.portDetails || previousName === undefined ? closet : {
      ...closet, layout: { ...closet.layout, portDetails: Object.fromEntries(Object.entries(closet.layout.portDetails).map(([key, details]) => [key, details.facilityLocation === previousName ? { ...details, facilityLocation: saved.name } : details])) },
    }),
  };
}

export function removeFacilityLocation(project: Project, name: string): Project {
  if (facilityLocationUsage(project, name).ports) throw new Error('Clear or reassign this location’s ports before deleting it.');
  return { ...project, configuration: { ...project.configuration, facilityLocations: (project.configuration.facilityLocations ?? []).filter(l => l.name !== name) } };
}
