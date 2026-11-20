import { useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { TemplatePort } from '../equipmentTemplates';

type Point = { x: number; y: number };
type Marquee = { start: Point; end: Point };
const pointInImage = (event: ReactPointerEvent<SVGSVGElement>): Point => {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
};

export function usePortDragSelection({ enabled, additive, ports, selection, onImageSelect, onListSelect }: {
  enabled: boolean; additive: boolean; ports: readonly (TemplatePort | null)[]; selection: number[];
  onImageSelect: (indices: number[]) => void; onListSelect: (indices: number[]) => void;
}) {
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const imageDrag = useRef<{ id: number; start: Point; clientX: number; clientY: number; moved: boolean; port: number | null; base: number[]; ports: readonly (TemplatePort | null)[] } | null>(null);
  const listDrag = useRef<{ id: number; start: number; clientX: number; clientY: number; checked: boolean; moved: boolean; base: number[]; values: Set<number> } | null>(null);
  const suppressListClick = useRef(false);
  const suppressImageClick = useRef(false);
  const cancel = () => { if (imageDrag.current?.moved) suppressImageClick.current = true; imageDrag.current = null; setMarquee(null); if (listDrag.current?.moved) onListSelect(listDrag.current.base); listDrag.current = null; };
  const choiceAt = (element: Element | null) => {
    const index = element?.closest('[data-grid-choice]')?.getAttribute('data-grid-choice');
    return index === undefined || index === null ? null : Number(index);
  };
  return {
    marquee,
    cancel,
    imageEvents: {
      onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
        if (event.button !== 0 || imageDrag.current || (!enabled && event.pointerType === 'touch')) return;
        event.preventDefault();
        suppressImageClick.current = false;
        const start = pointInImage(event);
        const index = (event.target as Element).closest('[data-map-index]')?.getAttribute('data-map-index');
        imageDrag.current = { id: event.pointerId, start, clientX: event.clientX, clientY: event.clientY, moved: false, port: index === undefined || index === null ? null : Number(index), base: additive || event.shiftKey ? selection : [], ports };
        if (enabled) {
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus({ preventScroll: true });
          setMarquee({ start, end: start });
        }
      },
      onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
        const drag = imageDrag.current;
        if (!drag || drag.id !== event.pointerId) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4) return;
        if (!drag.moved) {
          drag.moved = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus({ preventScroll: true });
        }
        setMarquee({ start: drag.start, end: pointInImage(event) });
      },
      onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
        const drag = imageDrag.current;
        if (!drag || drag.id !== event.pointerId) return;
        if (!enabled && !drag.moved) { imageDrag.current = null; return; }
        suppressImageClick.current = true;
        const end = pointInImage(event);
        const click = Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4;
        const hits = click ? drag.port === null ? [] : [drag.port] : drag.ports.flatMap((p, i) => p &&
          p.x + p.width / 2 >= Math.min(drag.start.x, end.x) && p.x - p.width / 2 <= Math.max(drag.start.x, end.x) &&
          p.y + p.height / 2 >= Math.min(drag.start.y, end.y) && p.y - p.height / 2 <= Math.max(drag.start.y, end.y) ? [i] : []);
        onImageSelect([...new Set([...drag.base, ...hits])].sort((a, b) => a - b));
        imageDrag.current = null; setMarquee(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onClickCapture(event: ReactMouseEvent<SVGSVGElement>) {
        if (suppressImageClick.current) { event.preventDefault(); event.stopPropagation(); suppressImageClick.current = false; }
      },
      onDragStart(event: React.DragEvent<SVGSVGElement>) { event.preventDefault(); },
      onPointerCancel() { suppressImageClick.current = true; imageDrag.current = null; setMarquee(null); },
      onLostPointerCapture() { imageDrag.current = null; setMarquee(null); },
    },
    listEvents: {
      onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        if (!enabled || event.button !== 0) return;
        const index = choiceAt(event.target as Element);
        suppressListClick.current = false;
        if (index === null) return;
        listDrag.current = { id: event.pointerId, start: index, clientX: event.clientX, clientY: event.clientY, checked: !selection.includes(index), moved: false, base: selection, values: new Set(selection) };
      },
      onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const drag = listDrag.current;
        if (!drag || drag.id !== event.pointerId) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4) return;
        event.preventDefault();
        if (!drag.moved) {
          drag.moved = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          if (drag.checked) drag.values.add(drag.start); else drag.values.delete(drag.start);
        }
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const index = target && event.currentTarget.contains(target) ? choiceAt(target) : null;
        if (index !== null) { if (drag.checked) drag.values.add(index); else drag.values.delete(index); }
        onListSelect([...drag.values].sort((a, b) => a - b));
      },
      onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
        if (listDrag.current?.id !== event.pointerId) return;
        suppressListClick.current = listDrag.current.moved;
        listDrag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
        if (suppressListClick.current) { event.preventDefault(); event.stopPropagation(); suppressListClick.current = false; }
      },
      onPointerCancel() { if (listDrag.current?.moved) onListSelect(listDrag.current.base); listDrag.current = null; },
      onLostPointerCapture() { if (listDrag.current?.moved) onListSelect(listDrag.current.base); listDrag.current = null; },
    },
  };
}
