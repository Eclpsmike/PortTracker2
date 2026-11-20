import { Icon, type IconName } from './Icon';

export function ConfigurationNav({ page }: { page: string }) {
  const links: [string, string, IconName][] = [['vlans', 'VLAN list', 'layers'], ['facility-locations', 'Facility locations', 'network'], ['stock', 'Cable stock', 'cable'], ['templates', 'Equipment templates', 'rack']];
  return <aside className="configuration-nav" aria-label="Configuration navigation">
    <span className="eyebrow">WORKSPACE SETTINGS</span>
    {links.map(([key, label, icon]) => <a key={key} href={`#/configuration/${key}`} className={page === key ? 'active' : ''} aria-current={page === key ? 'page' : undefined}><Icon name={icon}/>{label}<Icon name="chevron" size={14}/></a>)}
    <p>Shared across this site and included in project backups.</p>
    <a className="back-to-cabinets" href="#/cabinets"><Icon name="rack"/>Back to racks</a>
  </aside>;
}
