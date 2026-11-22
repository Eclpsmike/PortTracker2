import test from 'node:test';
import assert from 'node:assert/strict';
import { stackProject } from './stack-fixture';
import { parseDeviceDefinition, validCustomTemplates, MAX_YAML_BYTES } from '../src/templateImport';
import { createTemplatePackage, importTemplatePackage, parseTemplatePackage } from '../src/templatePackage';
import { parseProject } from '../src/project';

const yaml='# Original comments survive\r\nmanufacturer: Juniper\r\nmodel: Test switch\r\nu_height: 1\r\ninterfaces:\r\n  - {name: "ge-0/0/[0-47]", type: 1000base-t}\r\nconsole-ports:\r\n  - {name: console, type: rj-45}\r\npower-ports:\r\n  - {name: PSU1, type: iec-60320-c14}\r\nx-vendor: {preserve: true}\r\n';
function fixture(){
  const project=stackProject(),template=project.templates![0];
  template.source!.yaml=yaml;
  template.rearImage={imageSrc:template.imageSrc,imageWidth:template.imageWidth,imageHeight:template.imageHeight};
  template.ports=[...template.ports,{name:'console',function:'console',consoleConnector:'RJ45',sourceSection:'console-ports',face:'rear',x:.5,y:.5,width:.05,height:.2},{name:'Auxiliary',manual:true,function:'ethernet',face:'rear',x:.8,y:.5,width:.05,height:.2,media:{kind:'copper'}}];
  template.portCount=50;
  return {project,template};
}
test('YAML console sections retain their source and connector while unused fields remain in original text',()=>{
  const parsed=parseDeviceDefinition(yaml);
  assert.equal(parsed.ports.length,49);
  assert.deepEqual(parsed.ports.at(-1),{name:'console',type:'rj-45',sourceSection:'console-ports',function:'console',consoleConnector:'RJ45'});
  const base='manufacturer: Test\nmodel: Console only\nu_height: 1\nconsole-ports:\n';
  for(const [type,connector] of [['de-9','DB9'],['usb-c','USB-C'],['db-25','DB25'],['vendor-special','Other']]){
    assert.equal(parseDeviceDefinition(base+`  - {name: console, type: ${type}}`).ports[0].consoleConnector,connector);
  }
  for(const bad of [yaml.replace('name: console','name: ge-0/0/0'),yaml.replace('console-ports:', 'console-ports: wrong\nignored:'),base+'  - {name: console}',yaml+'#'+ 'a'.repeat(MAX_YAML_BYTES)])assert.throws(()=>parseDeviceDefinition(bad));
});
test('portable template and project round-trips preserve original source, both faces, and manually added ports',()=>{
  const {project,template}=fixture();
  const pkg=createTemplatePackage(template),restored=parseTemplatePackage(JSON.parse(JSON.stringify(pkg)));
  assert.deepEqual(restored,template);assert.equal(restored.source!.yaml,yaml);
  assert.equal(parseProject(JSON.parse(JSON.stringify(project)))!.templates![0].source!.yaml,yaml);
  restored.ports[0].x=.1;assert.notEqual(restored.ports[0].x,template.ports[0].x);
  const legacy=stackProject().templates![0];assert.equal(validCustomTemplates([legacy]),true);assert.equal(parseTemplatePackage(createTemplatePackage(legacy)).source!.yaml,undefined);
});
test('package imports create independent copies and never change installed equipment or existing templates',()=>{
  const {project,template}=fixture(),before=structuredClone(project);
  const imported=importTemplatePackage(project,createTemplatePackage(template));
  assert.notEqual(imported.template.id,template.id);assert.match(imported.template.name,/imported 1/);
  assert.deepEqual(imported.project.locations,project.locations);
  assert.deepEqual(imported.project.templates!.slice(0,2),project.templates);
  assert.deepEqual(project,before);
  const second=importTemplatePackage(imported.project,createTemplatePackage(template));
  assert.match(second.template.name,/imported 2/);assert.notEqual(second.template.id,imported.template.id);
  assert.ok(parseProject(JSON.parse(JSON.stringify(second.project))));
});
test('packages reject unsupported versions, project backups, external images, bad maps and invalid source',()=>{
  const {template}=fixture(),pkg=createTemplatePackage(template);
  for(const bad of [{...pkg,schemaVersion:2},{...pkg,format:'porttracker-project'},null,{...pkg,template:{...template,imageSrc:'https://example.com/image.png'}},{...pkg,template:{...template,ports:template.ports.slice(1)}},{...pkg,template:{...template,source:{...template.source,yaml:'model: ['}}}])assert.throws(()=>parseTemplatePackage(bad));
  assert.equal(validCustomTemplates([{...template,ports:template.ports.map(p=>p.function==='console'?{...p,function:'ethernet'}:p)}]),false);
});
