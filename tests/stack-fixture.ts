import { readFileSync } from 'node:fs';
import { EQUIPMENT_TEMPLATES, type EquipmentTemplate } from '../src/equipmentTemplates';
import { defaultConfiguration } from '../src/configuration';
import { defaultProject } from '../src/project';

export function stackProject() {
  const bundled = EQUIPMENT_TEMPLATES.find(t => t.kind === 'switch')!;
  const template: EquipmentTemplate = { ...bundled, id: 'custom-test-juniper', name: 'Juniper test switch', portStart: 0,
    source: { manufacturer: 'Juniper', model: 'Test switch', filename: 'test-switch.yaml' },
    imageSrc: `data:image/png;base64,${readFileSync(`public${bundled.imageSrc}`).toString('base64')}`,
    ports: bundled.ports.map((p, i) => ({ ...p, name: `ge-0/0/${i}` })),
  };
  const project = defaultProject(defaultConfiguration(), 'metric');
  project.templates = [template, { ...template, id: 'custom-test-juniper-2u', name: 'Juniper test 2U switch', heightU: 2 }];
  return project;
}
