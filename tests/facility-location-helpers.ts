import type { Page } from '@playwright/test';
import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';

// Existing port-documentation scenarios now choose entries from a configured list.
export async function seedFacilityLocations(page: Page, names: string[]) {
  const project = defaultProject({ ...defaultConfiguration(), facilityLocations: names.map(name => ({ name, color: '#159de7' })) }, 'metric');
  await page.addInitScript(project => {
    if (!localStorage.getItem('porttracker.project')) localStorage.setItem('porttracker.project', JSON.stringify(project));
  }, project);
}
