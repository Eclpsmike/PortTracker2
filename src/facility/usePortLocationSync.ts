import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Project } from '../project';
import type { FloorPlan } from './model';
import { readFloorPlan } from './storage';
import { placedPortLocations, syncPlacedPortLocations } from './portLocations';

export function usePortLocationSync(project:Project,setProject:Dispatch<SetStateAction<Project>>){
  const [floor,setFloor]=useState<{projectId:string;plan:FloorPlan}|null>(null);
  const version=useRef(0);
  const onPlanChange=useCallback((projectId:string,plan:FloorPlan)=>{version.current++;setFloor({projectId,plan});},[]);
  useEffect(()=>{
    let live=true;const initialVersion=version.current;
    void readFloorPlan(project.id).then(plan=>{if(live&&plan&&version.current===initialVersion)setFloor({projectId:project.id,plan});}).catch(()=>{/* The floor editor reports unavailable or unreadable drawing storage. */});
    return()=>{live=false;};
  },[project.id]);
  useEffect(()=>{
    if(!floor||floor.projectId!==project.id)return;
    setProject(current=>current.id===floor.projectId?syncPlacedPortLocations(current,floor.plan):current);
  },[floor,project,setProject]);
  const locations=useMemo(()=>floor?.projectId===project.id?new Map([...placedPortLocations(project,floor.plan)].flatMap(([key,value])=>value?[[key,value.name] as const]:[])):new Map<string,string>(),[floor,project]);
  return {onPlanChange,locations};
}
