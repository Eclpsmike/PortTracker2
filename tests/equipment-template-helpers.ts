import type { Page } from '@playwright/test';
import { setEquipmentTemplate } from '../src/model';
import { projectLayout, type Project } from '../src/project';

// Load an existing template assignment, as saved projects do. The inspector no
// longer provides a control for replacing a device's appearance.
export async function loadTemplateFixture(page: Page, rackId: string, equipmentId: string, templateId: string | null) {
  const project: Project = await page.evaluate(() => JSON.parse(localStorage.getItem('porttracker.project')!));
  const location = project.locations[0];
  const { templates: _templates, ...layout } = setEquipmentTemplate(projectLayout(project, location.id), rackId, equipmentId, templateId);
  location.layout = layout;
  await page.evaluate(project => localStorage.setItem('porttracker.project', JSON.stringify(project)), project);
  await page.reload();
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await page.getByRole('combobox', { name: 'Manage rack', exact: true }).selectOption(rackId);
  await page.getByRole('combobox', { name: 'Manage equipment', exact: true }).selectOption(equipmentId);
}
