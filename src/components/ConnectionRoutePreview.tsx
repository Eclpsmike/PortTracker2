import { cableMediaError, endpointFace, cableRoute, estimateCable, hasVerticalManagement, rackName, resolveEndpoint, sameEndpoint, type Cable, type Calibration, type Layout } from '../model';
import { fiberLabel } from '../media';
import { cableLengthUnitSymbol, formatCableLengthValue, type LengthUnit } from '../units';
import { ConnectionEndpointHeading } from './ConnectionPortSummary';
import { PathDiagram } from './PathDiagram';

export function ConnectionRoutePreview({ layout, cable, calibration, lengthUnit, portPrefix }: {
  layout: Layout; cable: Cable; calibration: Calibration; lengthUnit: LengthUnit; portPrefix?: string;
}) {
  const route = cableRoute(layout, cable);
  const problem = sameEndpoint(cable.from, cable.to) ? 'Choose two different ports to preview the route.' : cableMediaError(layout, cable);
  const estimate = problem ? null : estimateCable(layout, cable, calibration);
  const format = (meters: number) => `${formatCableLengthValue(meters, lengthUnit)} ${cableLengthUnitSymbol(lengthUnit)}`;
  function sideLabel(side: 'from' | 'to') {
    const { rack } = resolveEndpoint(layout, cable[side]);
    return `${rackName(layout, rack.id)} · ${route.sides[side]} ${hasVerticalManagement(rack) ? 'vertical manager' : 'rack side'}`;
  }
  return <section className="connection-route-preview" aria-label="Cable routing suggestion">
    <div className="route-preview-heading"><h3>Suggested cable route</h3><span>{route.cross ? 'Cross-rack' : 'Same rack'}</span></div>
    <ConnectionEndpointHeading layout={layout} cable={cable} portPrefix={portPrefix}/>
    {!sameEndpoint(cable.from, cable.to) && <><PathDiagram cable={cable} layout={layout} showVlan={false} tracing={false}/>
      <p className="route-preview-description">{sideLabel('from')}{route.overhead ? ' via overhead tray' : ''} to {sideLabel('to')}</p></>}
    {problem ? <p className="note" role="status">{problem}</p> : estimate && <>
      {endpointFace(layout, cable.from) !== endpointFace(layout, cable.to) && <p className="note">Front-to-rear connection: the estimate excludes rack depth. Allow extra cable for the run between faces.</p>}
      <dl className="route-preview-lengths">
        <div><dt title="Estimated route length, including bend allowance and service slack from rack calibration">Estimated length</dt><dd>{format(estimate.requiredM)}</dd></div>
        <div><dt>Patch cable needed</dt><dd>{estimate.recommendedM === null ? 'No suitable stocked length' : format(estimate.recommendedM)}</dd></div>
      </dl>
      <p className="route-preview-type">{cable.medium === 'fiber' ? `Fiber patch cable · ${fiberLabel(cable.fiber!)}` : 'Copper patch cable · RJ45–RJ45'}<span className="swatch" style={{ background: cable.jacket }} title={`Jacket color ${cable.jacket}`}/></p>
      <p className="note">{estimate.recommendedM === null ? `A compatible cable of at least ${format(estimate.requiredM)} is needed. Check the configured cable stock.` : 'Smallest compatible stocked length covering the route, bend allowance and service slack.'}</p>
    </>}
  </section>;
}
