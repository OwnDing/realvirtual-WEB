// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { getLocale, initI18n, setLocale } from '../src/core/i18n';
import { setAppConfig } from '../src/core/rv-app-config';
import { helpDestination, configuredHelpBase } from '../src/core/hmi/help-destination';
import { userFailure, userFailureText } from '../src/core/user-errors/failure';
import { UserHelpLink } from '../src/core/hmi/UserHelpLink';
import DemoExportPanel from '../src/core/demo-package/DemoExportPanel';
import { DemoPackageError } from '../src/core/demo-package/recipe';
import { setActiveDocumentView, resetActiveDocumentViewForTests } from '../src/core/editor/active-document-view';
import type { RVViewer } from '../src/core/rv-viewer';
import { DocumentCard } from '../src/core/hmi/scene/DocumentCard';
import { helpAriaLabel } from '../src/core/hmi/help-context';
beforeEach(async()=>{initI18n();await setLocale('en-US');setAppConfig({services:{documentation:{baseUrl:location.origin+'/training/user-help/'}}});});
afterEach(()=>{cleanup();resetActiveDocumentViewForTests();setAppConfig({});});
describe('customer help and error boundaries',()=>{
 it('preserves external links, subpaths and explicit disable including legacy config',async()=>{
  expect(helpDestination({slug:'tours'})).toBe(location.origin+'/training/user-help/tours/?lang=en-US');
  await setLocale('zh-CN');expect(helpDestination({slug:'viewer/interface',anchor:'hierarchy'})).toBe(location.origin+'/training/user-help/viewer/interface/?lang=zh-CN#hierarchy');
  setAppConfig({services:{documentation:null},docs:{baseUrl:location.origin+'/old/'}});expect(configuredHelpBase()).toBeUndefined();expect(helpDestination({slug:'tours'})).toBeUndefined();
  setAppConfig({services:{documentation:{baseUrl:'https://help.example/reference/'}},egress:{mode:'allow-listed',allow:[{origin:'https://help.example',purposes:['documentation']}]}});
  expect(helpDestination({slug:'viewer/interface',anchor:'hierarchy'})).toBe('https://help.example/reference/viewer/interface/#hierarchy');
 });
 it('renders an accessible help link in the selected language',async()=>{
  render(<UserHelpLink topic="tours"/>);expect(screen.getByRole('link').getAttribute('href')).toContain('lang=en-US');
  await act(()=>setLocale('zh-CN'));expect(screen.getByRole('link').getAttribute('aria-label')).toContain('排障');expect(screen.getByRole('link').getAttribute('href')).toContain('lang=zh-CN');
  expect(helpAriaLabel({slug:'viewer/interface'})).toContain('操作界面');
 });
 it('localizes a real save rejection and removes it when the document changes',async()=>{
  const view={name:'Public fixture',crumbs:[],dirty:true,busy:false,stackDirty:false,stale:false,saveVerb:'save' as const,sourceMode:'editor',actions:{save:async()=>{throw new DOMException('customer-private-token','QuotaExceededError');}}};
  setActiveDocumentView(view);render(<DocumentCard/>);
  fireEvent.click(screen.getByTestId('document-card-save'));
  await waitFor(()=>expect(screen.getByTestId('document-card-status').textContent).toContain('Storage is full'));
  expect(document.body.textContent).not.toContain('customer-private-token');
  await act(()=>setLocale('zh-CN'));
  expect(screen.getByTestId('document-card-status').textContent).toContain('存储空间不足');
  act(()=>setActiveDocumentView({...view,name:'Another document'}));
  expect(screen.getByTestId('document-card-status').textContent).not.toContain('存储空间不足');
 });
 it.each([['NotAllowedError','permission'],['QuotaExceededError','quota'],['AbortError','cancelled'],['TimeoutError','timeout'],['NotFoundError','missing']])('maps %s without copying sensitive details',(name,reason)=>{
  const failure=userFailure(new DOMException('secret://customer/token',name),'save');expect(failure.reason).toBe(reason);expect(JSON.stringify(failure)).not.toContain('secret');expect(userFailureText(failure,'en-US')).not.toContain('secret');
 });
 it('keeps an already visible domain error localized after changing language',async()=>{
  const camera=new PerspectiveCamera(50);camera.position.set(3,2,4);
  const viewer={camera,controls:{target:new Vector3()},currentModelRoot:new Group(),animateCameraTo:vi.fn()} as unknown as RVViewer;
  const capability={identity:{},run:async()=>{throw new DemoPackageError('reference');}};
  setActiveDocumentView({name:'Public fixture',crumbs:[],dirty:false,busy:false,stackDirty:false,stale:false,saveVerb:'save',sourceMode:'editor',actions:{save:async()=>({status:'saved'}),exportDemo:capability}});
  render(<DemoExportPanel viewer={viewer} capability={capability} name="Public fixture" mode="editor" onClose={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Export demo HTML'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('unresolved asset references'));
  await act(()=>setLocale('zh-CN'));
  expect(screen.getByRole('alert').textContent).toContain('未解析的资产引用');expect(getLocale()).toBe('zh-CN');
 });
 it('unknown failures retain no arbitrary text or keys',()=>{
  const error=new Error('customer-model.glb?token=private');
  const result=userFailure(error,'load');expect(result).toEqual({operation:'load',reason:'unknown'});expect(userFailureText(result,'zh-CN')).toContain('诊断');expect(userFailureText(result,'en-US')).not.toContain('customer-model');
 });
});
