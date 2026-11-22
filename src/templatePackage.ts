import { EQUIPMENT_TEMPLATES, type EquipmentTemplate } from './equipmentTemplates';
import { parseDeviceDefinition, readTemplateImage, validCustomTemplates } from './templateImport';
import { saveEquipmentTemplate, type Project } from './project';

export interface TemplatePackage { format: 'porttracker-template'; schemaVersion: 1; template: EquipmentTemplate }
export const MAX_TEMPLATE_PACKAGE_BYTES = 8 * 1024 * 1024;
export function createTemplatePackage(template: EquipmentTemplate): TemplatePackage {
  if (!validCustomTemplates([template])) throw new Error('This template has invalid port maps, images, or source YAML.');
  return {format:'porttracker-template',schemaVersion:1,template:structuredClone(template)};
}
export function parseTemplatePackage(value: unknown): EquipmentTemplate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a PortTracker template package.');
  const data=value as Record<string,unknown>;
  if(data.format!=='porttracker-template')throw new Error('Choose a template package, not a project backup or YAML file.');
  if(data.schemaVersion!==1)throw new Error('This template package version is not supported.');
  if(!validCustomTemplates([data.template]))throw new Error('The template package contains invalid ports, images, source YAML, or exceeds the embedded data limit.');
  return structuredClone(data.template as EquipmentTemplate);
}
export function importTemplatePackage(project: Project, value: unknown): { project: Project; template: EquipmentTemplate } {
  const template=parseTemplatePackage(value);
  const names=new Set([...EQUIPMENT_TEMPLATES,...(project.templates??[])].map(t=>t.name.trim().toLowerCase()));
  const original=template.name;
  let name=original, n=1;
  while(names.has(name.toLowerCase())){const suffix=` (imported ${n++})`;name=original.slice(0,100-suffix.length)+suffix;}
  const copy={...template,id:`custom-${crypto.randomUUID()}`,name};
  return {project:saveEquipmentTemplate(project,copy),template:copy};
}
export async function readTemplatePackage(file: File): Promise<TemplatePackage> {
  if(file.size>MAX_TEMPLATE_PACKAGE_BYTES)throw new Error('Choose a template package up to 8 MB.');
  let value:unknown;
  try{value=JSON.parse(await file.text());}catch{throw new Error('The template package is not valid JSON.');}
  const template=parseTemplatePackage(value);
  for(const asset of [template,template.rearImage].filter(asset=>!!asset)){
    const image=new Image();image.src=asset.imageSrc;
    try{await image.decode();}catch{throw new Error('A packaged image could not be decoded.');}
    if(image.naturalWidth!==asset.imageWidth || image.naturalHeight!==asset.imageHeight)throw new Error('A packaged image does not match its recorded dimensions.');
  }
  return createTemplatePackage(template);
}
const BUNDLED_YAML:Record<string,string>={
  'netbox-generic-copper-24':'/equipment/netbox/24-port-copper-patch-panel.yaml',
  'netbox-ubiquiti-us-48':'/equipment/netbox/US-48.yaml',
};
export async function exportableTemplate(template:EquipmentTemplate):Promise<EquipmentTemplate>{
  if(template.source)return createTemplatePackage(template).template;
  const path=BUNDLED_YAML[template.id];
  if(!path)throw new Error('This bundled template has no export source.');
  const [yamlResponse,imageResponse]=await Promise.all([fetch(path),fetch(template.imageSrc)]);
  if(!yamlResponse.ok||!imageResponse.ok)throw new Error('Could not load the bundled template assets.');
  const yaml=await yamlResponse.text(),definition=parseDeviceDefinition(yaml);
  const image=await readTemplateImage(new File([await imageResponse.blob()],'front.png',{type:'image/png'}));
  return createTemplatePackage({...template,...image,id:`custom-${template.id}`,source:{manufacturer:definition.manufacturer,model:definition.model,filename:path.split('/').pop()!,yaml},ports:template.ports.map((port,i)=>({...port,name:port.name??definition.ports[i]?.name??`Port ${i+1}`,interfaceType:definition.ports[i]?.type,sourceSection:definition.ports[i]?.sourceSection}))}).template;
}
export const templatePackageFilename=(template:EquipmentTemplate)=>`${template.name.replace(/[^\w-]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'equipment'}.porttracker-template.json`;
