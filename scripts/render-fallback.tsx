import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixtureLayout } from '../src/model';
import { RackScene } from '../src/components/RackScene';
const layout = fixtureLayout();
const markup = renderToStaticMarkup(<RackScene layout={layout} rackIds={layout.racks.map(r => r.id)} cables={layout.cables} selectedCable={layout.cables.find(c => c.id === 'CR-0018')} selectedPort={null} showCables showVlan tracing={false} onPort={() => {}} onCable={() => {}}/>);
mkdirSync('public', { recursive: true });
writeFileSync('public/rack-fallback.svg', markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
