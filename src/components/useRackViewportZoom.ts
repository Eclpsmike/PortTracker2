import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export function useRackViewportZoom({ viewport, enabled, scale, maxZoom, onZoom }: {
  viewport: RefObject<HTMLDivElement | null>; enabled: boolean; scale: number; maxZoom: number; onZoom: (scale: number) => void;
}) {
  const latest = useRef({ scale, maxZoom, onZoom });
  latest.current = { scale, maxZoom, onZoom };
  const anchor = useRef<{ x: number; y: number; clientX: number; clientY: number; scale: number } | null>(null);

  useEffect(() => {
    const element = viewport.current;
    if (!enabled || !element) return;
    const wheel = (event: WheelEvent) => {
      // Browsers deliver touchpad pinch as Ctrl+wheel. Ordinary scrolling
      // remains native so two-finger panning and scrollbars keep working.
      if (!event.ctrlKey) return;
      event.preventDefault();
      const frame = element.querySelector<HTMLElement>('.scene-frame');
      if (!frame) return;
      const current = latest.current;
      const previousScale = anchor.current?.scale ?? current.scale;
      const nextScale = Math.max(.12, Math.min(current.maxZoom, previousScale * Math.exp(-event.deltaY * .002)));
      if (nextScale === previousScale) return;
      const rect = frame.getBoundingClientRect();
      anchor.current = {
        x: (event.clientX - rect.left) / current.scale,
        y: (event.clientY - rect.top) / current.scale,
        clientX: event.clientX, clientY: event.clientY, scale: nextScale,
      };
      current.onZoom(nextScale);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); anchor.current = null; };
  }, [viewport, enabled]);

  useLayoutEffect(() => {
    const point = anchor.current, element = viewport.current;
    const frame = element?.querySelector<HTMLElement>('.scene-frame');
    if (!point || !element || !frame) return;
    const rect = frame.getBoundingClientRect();
    // Restore the scene point under the pointer after resizing and recentering.
    // Native scroll limits apply when the scene is smaller than the viewport.
    element.scrollLeft += rect.left + point.x * scale - point.clientX;
    element.scrollTop += rect.top + point.y * scale - point.clientY;
    anchor.current = null;
  }, [viewport, scale]);
}
