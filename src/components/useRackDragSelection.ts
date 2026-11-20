import { useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { type Endpoint, type Layout, portNumbers } from '../model';
import { portPoint } from '../geometry';

export type RackSelectionBox = { x: number; y: number; width: number; height: number };
export function useRackDragSelection({ layout, rackIds, touchEnabled, onSelect }: {
  layout: Layout; rackIds: string[]; touchEnabled: boolean;
  onSelect: (ports: Endpoint[], additive: boolean, preferredDevice?: string) => void;
}) {
  const [box, setBox] = useState<RackSelectionBox | null>(null);
  const drag = useRef<{ id: number; svg: SVGSVGElement; x: number; y: number; clientX: number; clientY: number; moved: boolean; additive: boolean; preferredDevice?: string } | null>(null);
  const suppressClick = useRef(false);
  function point(svg: SVGSVGElement, clientX: number, clientY: number) {
    const p = svg.createSVGPoint(); p.x = clientX; p.y = clientY;
    const matrix = svg.getScreenCTM();
    return matrix ? p.matrixTransform(matrix.inverse()) : null;
  }
  function cancel() { if (drag.current?.moved) suppressClick.current = true; drag.current = null; setBox(null); }
  return { box, handlers: {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0 || drag.current || (event.pointerType === 'touch' && !touchEnabled)) return;
      const viewport = event.currentTarget.getBoundingClientRect();
      if (event.clientX >= viewport.left + event.currentTarget.clientWidth || event.clientY >= viewport.top + event.currentTarget.clientHeight) return;
      const svg = event.currentTarget.querySelector<SVGSVGElement>('.rack-scene');
      if (!svg) return;
      const p = point(svg, event.clientX, event.clientY);
      if (!p) return;
      event.preventDefault(); suppressClick.current = false;
      drag.current = { id: event.pointerId, svg, x: p.x, y: p.y, clientX: event.clientX, clientY: event.clientY, moved: false, additive: event.shiftKey,
        preferredDevice: (event.target as Element).closest('[data-equipment]')?.getAttribute('data-equipment') ?? undefined };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const d = drag.current;
      if (!d || d.id !== event.pointerId) return;
      if (!d.moved && Math.hypot(event.clientX - d.clientX, event.clientY - d.clientY) < 4) return;
      const p = point(d.svg, event.clientX, event.clientY);
      if (!p) return;
      if (!d.moved) { d.moved = true; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true }); }
      setBox({ x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), width: Math.abs(p.x - d.x), height: Math.abs(p.y - d.y) });
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      const d = drag.current;
      if (!d || d.id !== event.pointerId) return;
      if (d.moved) {
        suppressClick.current = true;
        const p = point(d.svg, event.clientX, event.clientY);
        if (p) {
          const left = Math.min(d.x, p.x), right = Math.max(d.x, p.x), top = Math.min(d.y, p.y), bottom = Math.max(d.y, p.y);
          const hits = layout.racks.filter(r => rackIds.includes(r.id)).flatMap(r => r.equipment.flatMap(e => portNumbers(e).flatMap(port => {
            const ep = { rackId: r.id, equipmentId: e.id, port }, center = portPoint(layout, ep, rackIds);
            return center.x >= left && center.x <= right && center.y >= top && center.y <= bottom ? [{ ep, distance: Math.hypot(center.x - d.x, center.y - d.y) }] : [];
          })));
          hits.sort((a, b) => a.distance - b.distance);
          onSelect(hits.map(h => h.ep), d.additive, d.preferredDevice);
        }
      }
      drag.current = null; setBox(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onClickCapture(event: MouseEvent<HTMLDivElement>) { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } },
    onPointerCancel: cancel,
    onLostPointerCapture(event: PointerEvent<HTMLDivElement>) { if (event.target === event.currentTarget && drag.current?.id === event.pointerId) cancel(); },
    onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) { if (event.key === 'Escape') cancel(); },
    onDragStart(event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); },
  } };
}
