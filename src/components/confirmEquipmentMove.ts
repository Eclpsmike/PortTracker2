import { equipmentUnits, rackName, resolveEquipment, type Layout } from '../model';

export function confirmEquipmentMove(layout:Layout,rackId:string,equipmentId:string,destinationId:string,bottomU:number):boolean{
  const {equipment}=resolveEquipment(layout,rackId,equipmentId);
  if(rackId===destinationId&&equipment.bottomU===bottomU)return true;
  const count=layout.cables.filter(c=>[c.from,c.to].some(ep=>ep.rackId===rackId&&ep.equipmentId===equipmentId)).length;
  if(!count)return true;
  return window.confirm(
    `${equipment.label} has ${count} cable ${count===1?'connection':'connections'}. Check the connected cables before moving this equipment.\n\n`+
    `From: ${rackName(layout,rackId)} · ${equipmentUnits(equipment)}\nTo: ${rackName(layout,destinationId)} · ${equipmentUnits({...equipment,bottomU})}\n\n`+
    'Connections and port data will stay linked. Cable routes and estimated lengths will be recalculated.\n\nMove equipment?'
  );
}
