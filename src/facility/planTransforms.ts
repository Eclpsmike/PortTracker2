import { objectBounds, translateObject, type Background, type FloorPlan, type Point } from './model';

export interface CropBox extends Point { width: number; height: number }
export const fullCrop = (background: Background): CropBox => ({ x: 0, y: 0, width: background.width, height: background.height });
export function validCrop(background: Background, crop: CropBox) {
  return [crop.x,crop.y,crop.width,crop.height].every(Number.isInteger) && crop.x >= 0 && crop.y >= 0 && crop.width >= 1 && crop.height >= 1 && crop.x + crop.width <= background.width && crop.y + crop.height <= background.height;
}
const contains = (crop: CropBox, point: Point) => point.x >= crop.x && point.y >= crop.y && point.x <= crop.x + crop.width && point.y <= crop.y + crop.height;
export function excludedObjects(plan: FloorPlan, crop: CropBox) {
  return plan.objects.filter(o => { const b=objectBounds(o); return !contains(crop,b) || !contains(crop,{x:b.x+b.width,y:b.y+b.height}); });
}
export function cropFloorPlan(plan: FloorPlan, crop: CropBox, src: string): FloorPlan {
  if (!validCrop(plan.background,crop)) throw new Error('Choose a crop inside the drawing with a width and height of at least 1.');
  const excluded=excludedObjects(plan,crop);
  if (excluded.length) throw new Error(`The crop excludes ${excluded.length} object(s). Expand the crop or move those objects first, including objects on hidden or locked layers.`);
  const shift=(p:Point)=>({x:p.x-crop.x,y:p.y-crop.y});
  const calibration=plan.calibration && contains(crop,plan.calibration.a) && contains(crop,plan.calibration.b)
    ? {...plan.calibration,a:shift(plan.calibration.a),b:shift(plan.calibration.b)} : null;
  return {...plan,background:{...plan.background,src,width:crop.width,height:crop.height},objects:plan.objects.map(o=>translateObject(o,-crop.x,-crop.y)),calibration};
}
export function rotateFloorPlan(plan: FloorPlan, clockwise: boolean, src: string): FloorPlan {
  const {width,height}=plan.background;
  const rotate=(p:Point):Point=>clockwise?{x:height-p.y,y:p.x}:{x:p.y,y:width-p.x};
  return {...plan,background:{...plan.background,src,width:height,height:width},
    objects:plan.objects.map(o=>{
      if(o.kind==='location') {
        const corners=[rotate(o),rotate({x:o.x+o.width!,y:o.y+o.height!})];
        return {...o,x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y)),width:o.height,height:o.width};
      }
      if(o.points){const points=o.points.map(rotate);return {...o,...points[0],points};}
      return {...o,...rotate(o),rotation:((o.rotation+(clockwise?90:-90))%360+360)%360};
    }),calibration:plan.calibration?{...plan.calibration,a:rotate(plan.calibration.a),b:rotate(plan.calibration.b)}:null};
}

// User-facing image tools use canvas pixels; drawing geometry is transformed separately.
export async function renderPlanImage(background: Background, operation: { clockwise: boolean } | CropBox): Promise<string> {
  const rotating='clockwise' in operation;
  const width=rotating?background.height:operation.width,height=rotating?background.width:operation.height;
  if(width*height>16_000_000)throw new Error('This drawing is too large to edit in the browser. Import a smaller image first.');
  const image=new Image();
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('The floor plan image could not be opened.'));image.src=background.src;});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image editing is unavailable in this browser.');
  if(rotating){ctx.translate(operation.clockwise?width:0,operation.clockwise?0:height);ctx.rotate(operation.clockwise?Math.PI/2:-Math.PI/2);ctx.drawImage(image,0,0,background.width,background.height);}
  else ctx.drawImage(image,operation.x/background.width*image.naturalWidth,operation.y/background.height*image.naturalHeight,operation.width/background.width*image.naturalWidth,operation.height/background.height*image.naturalHeight,0,0,width,height);
  return canvas.toDataURL('image/png');
}
