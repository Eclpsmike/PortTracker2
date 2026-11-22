import type { Project } from '../project';
import type { FloorPort } from './model';

import { formatPrefixedPortNumber } from '../portNumbering';
import { patchPanelNumber } from './portLocations';
export { formatPrefixedPortNumber } from '../portNumbering';

export function prefixedFacilityPortLabel(port: FloorPort, project: Project): string | null {
  const prefix = project.locations.find(location => location.id === port.idfId)?.portPrefix;
  if (!prefix) return null;
  let number: string | number | undefined = port.patchPanelPort ?? (/^\d+$/.test(port.label) ? port.label : undefined);
  if(port.patchPanelId&&port.patchPanelPort!==undefined){
    const panels=project.locations.find(frame=>frame.id===port.idfId)?.layout.racks.filter(rack=>!port.rackId||rack.id===port.rackId).flatMap(rack=>rack.equipment.filter(equipment=>equipment.id===port.patchPanelId&&equipment.kind==='patch-panel'))??[];
    if(panels.length===1&&port.patchPanelPort>=(panels[0].portStart??1)&&port.patchPanelPort<(panels[0].portStart??1)+panels[0].portCount)number=patchPanelNumber(panels[0],port.patchPanelPort);
  }
  return number === undefined ? null : formatPrefixedPortNumber(prefix, number);
}

export const facilityPortLabel = (port: FloorPort, project: Project) => prefixedFacilityPortLabel(port, project) ?? port.label;
