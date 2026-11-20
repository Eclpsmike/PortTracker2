import type { Background } from './model';

export const fileData = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the file.')); reader.readAsDataURL(file);
});
export async function readBackground(file: File, pageNumber = 1): Promise<Background> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a drawing smaller than 25 MB.');
  const original = await fileData(file);
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: '/pdfjs-assets/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs-assets/standard_fonts/', wasmUrl: '/pdfjs-assets/wasm/' });
    task.onPassword = () => { void task.destroy(); };
    try {
      const pdf = await task.promise;
      if (pageNumber < 1 || pageNumber > pdf.numPages) throw new Error(`Choose a PDF page from 1 to ${pdf.numPages}.`);
      const page = await pdf.getPage(pageNumber), base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 2400 / Math.max(base.width, base.height)) });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      return { name: `${file.name} · page ${pageNumber}`, src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height,
        original: { name: file.name, data: original, page: pageNumber, pages: pdf.numPages } };
    } finally { await task.destroy(); }
  }
  if (!/\.(png|jpe?g|svg|webp)$/i.test(file.name)) throw new Error('Choose a PDF, PNG, JPEG, SVG or WebP drawing.');
  // SVG is decoded as an image in an isolated image context, then rasterized.
  // It is never inserted into the document as markup or executed as a script.
  const image = new Image(), url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The image could not be decoded.')); image.src = url; });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 20000 || image.naturalHeight > 20000) throw new Error('Image dimensions must be between 1 and 20,000 pixels.');
    const scale = Math.min(1, 3200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return { name: file.name, src: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, original: { name: file.name, data: original } };
  } finally { URL.revokeObjectURL(url); }
}
