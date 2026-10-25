// SPDX-License-Identifier: AGPL-3.0-only
// Records real production UI and downloads; no mocked canvas, synthetic slides or customer models.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from 'playwright/test';
import { helpTestServer } from './server.mjs';
import { sha } from './build.mjs';
import { tutorialSources } from './media-sources.mjs';
import { finalizeMedia } from './finalize-media.mjs';
import { webVtt } from './captions.mjs';
const output=resolve('docs/user/media'),temporary=resolve('test-results/user-help/recording'); await mkdir(temporary,{recursive:true});
const server=await helpTestServer(), browser=await chromium.launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let manifest={schemaVersion:1,recordedAt:new Date().toISOString(),productVersion:JSON.parse(await readFile('package.json')).version,screenLocale:'en-US',fixture:'public/library/PalletHandling/RollConveyor-3m.glb',fixtureSha256:sha(await readFile('public/library/PalletHandling/RollConveyor-3m.glb')),productionIndexSha256:sha(await readFile('dist/index.html')),browser:browser.version(),videos:[],files:{}};
try { const previous = JSON.parse(await readFile(resolve(output,'manifest.json'),'utf8')); manifest.videos = previous.videos; manifest.files = previous.files; } catch { /* first recording */ }
const selected=process.argv.find(arg=>arg.startsWith('--topic='))?.slice(8);
if (selected && !['navigation','tours','support'].includes(selected)) { await browser.close(); await server.close(); throw new Error('Unknown tutorial topic'); }

try {
 for(const topic of ['navigation','tours','support'].filter(topic=>!selected||topic===selected)) {
  console.log(`[tutorial] recording ${topic}`);
  const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:temporary,size:{width:1920,height:1080}},acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===server.origin||route.request().url().startsWith('file:')?route.continue():route.abort());
  await context.addInitScript(()=>{localStorage.setItem('rv-welcome-dismissed','1');localStorage.setItem('rv-terms-accepted','1');localStorage.setItem('rv-auto-quality-applied','1');localStorage.setItem('rv-connect-autoconnect-optout','1');});
  const page=await context.newPage();page.setDefaultTimeout(45000);const started=Date.now(),captions=[];
  const chapter=async(zh,en,action)=>{const start=Date.now()-started;await action();await page.waitForTimeout(20000);captions.push({start,end:Date.now()-started,zh,en});console.log(`[tutorial] ${topic}: ${en}`);};
  const boot=async()=>{await page.goto(server.url+'?mode=planner&lang=en-US&model=library/PalletHandling/RollConveyor-3m.glb',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.viewer?.currentModelRoot,undefined,{timeout:90000});await expect(page.locator('#loading-overlay')).toBeHidden({timeout:90000});const ok=page.getByTestId('auto-quality-ok');if(await ok.isVisible())await ok.click();};
  await chapter('打开随版本提供的公开输送机示例，等待资源就绪。','Open the bundled conveyor example and wait until it is ready.',boot);
  if(topic==='navigation') {
   await chapter('拖动画布旋转模型，用滚轮缩放。','Drag the canvas to orbit. Use the wheel to zoom.',async()=>{await page.mouse.move(1150,520);await page.mouse.down();await page.mouse.move(1370,570,{steps:8});await page.mouse.up();await page.mouse.wheel(0,-180);});
   await chapter('按 Shift+F 适配模型，然后查看层级。','Press Shift+F to fit the model, then open Hierarchy.',async()=>{await page.keyboard.press('Shift+F');await page.getByRole('button',{name:'Hierarchy',exact:true}).click();await page.waitForTimeout(500);await page.screenshot({path:resolve(output,'navigation.png')});});
   await chapter('设置中的视觉页提供语言选择。','The Visual settings page contains the language selector.',async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Visual',exact:true}).click();await page.getByTestId('rv-language-select').scrollIntoViewIfNeeded();});
   await chapter('切换中文。界面语言不会改写设备名称或项目。','Switch to Chinese. UI language does not rewrite device names or the project.',async()=>{await page.getByTestId('rv-language-select').getByRole('combobox').click();await page.getByRole('option',{name:'简体中文',exact:true}).click();});
   await chapter('切回英文。帮助可从按钮或 F1 打开。','Switch back to English. Open contextual help with its button or F1.',async()=>{await page.getByTestId('rv-language-select').getByRole('combobox').click();await page.getByRole('option',{name:'English',exact:true}).click();const popup=context.waitForEvent('page');await page.keyboard.press('Tab');await page.keyboard.press('Escape');await page.getByRole('button',{name:/Open help for/}).click();const help=await popup;await help.waitForLoadState('domcontentloaded');await help.close();});
  } else if(topic==='tours') {
   await chapter('打开当前文档更多菜单，选择演示打包。','Open the current document menu and choose Demo package.',async()=>{await page.getByRole('button',{name:'Hierarchy',exact:true}).click();await page.getByRole('button',{name:'More actions',exact:true}).first().click();await page.getByTestId('document-card-verb-export-demo').click();await expect(page.getByTestId('demo-export-panel')).toBeVisible();});
   const panel=page.getByTestId('demo-export-panel');
   await chapter('设定初始视角，添加镜头并填写标题与说明。','Set the initial view, add a shot and enter its title and description.',async()=>{await panel.getByLabel('Demo name',{exact:true}).fill('Conveyor introduction');await panel.getByRole('button',{name:'Set initial view',exact:true}).click();await panel.getByRole('button',{name:'Add current view',exact:true}).click();await panel.getByLabel('1. Shot title').fill('Conveyor overview');await panel.getByLabel('Shot description',{exact:true}).fill('A self-contained presentation of the public conveyor example.');await page.waitForTimeout(500);await page.screenshot({path:resolve(output,'tours.png')});});
   await chapter('保存导览配方。配方不含模型，需要另行保存模型。','Save the tour recipe. It does not contain the model; keep the model separately.',async()=>{const pending=page.waitForEvent('download');await panel.getByRole('button',{name:'Save tour recipe',exact:true}).click();const download=await pending;await download.saveAs(resolve(temporary,'conveyor.demo.json'));});
   let html;
   await chapter('导出演示 HTML，等待完整下载后再交付。','Export demo HTML and wait for the complete download before delivery.',async()=>{const pending=page.waitForEvent('download',{timeout:90000});await panel.getByRole('button',{name:'Export demo HTML',exact:true}).click();const download=await Promise.race([pending,panel.getByRole('alert').waitFor({state:'visible',timeout:90000}).then(async()=>{throw new Error(await panel.getByRole('alert').innerText());})]);html=resolve(temporary,'conveyor.html');await download.saveAs(html);assert((await readFile(html)).length>1000);});
   await chapter('断网打开下载文件。播放导览，拖动接管，再恢复初始视角。','Open the downloaded file offline. Play the tour, drag to take over, then reset the view.',async()=>{await context.setOffline(true);await page.goto(pathToFileURL(html).href,{waitUntil:'domcontentloaded',timeout:90000});await expect(page.locator('body')).toHaveAttribute('data-demo-ready','true',{timeout:90000});await page.getByRole('button',{name:'Play tour',exact:true}).click();await page.waitForTimeout(4000);await page.mouse.move(950,500);await page.mouse.down();await page.mouse.move(1100,550,{steps:8});await page.mouse.up();await page.getByRole('button',{name:'Initial view',exact:true}).click();});
  } else {
   await chapter('故障时保留当前页面，在设置中打开诊断与支持。','Keep the failing page open. Open Diagnostics & support in Settings.',async()=>{await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Diagnostics & support',exact:true}).click();});
   const panel=page.getByTestId('diagnostics-panel');
   await chapter('选择采集范围，刷新预览。诊断不会自动上传。','Choose the scope and refresh the preview. Diagnostics are not uploaded automatically.',async()=>{await panel.getByRole('button',{name:'Refresh preview',exact:true}).click();await expect(panel.getByTestId('diagnostics-preview')).toBeAttached();});
   await chapter('展开脱敏内容，确认实际内容和快照时间。','Expand the redacted preview. Check the actual contents and snapshot time.',async()=>{await panel.locator('summary').click();await page.waitForTimeout(500);await page.screenshot({path:resolve(output,'support.png')});});
   await chapter('下载诊断 ZIP，由你审阅并决定是否发送给支持人员。','Download the diagnostic ZIP. Review it and decide whether to send it to support.',async()=>{const pending=page.waitForEvent('download');await panel.getByRole('button',{name:'Export diagnostic bundle',exact:true}).click();const download=await pending;await download.saveAs(resolve(temporary,'diagnostics.zip'));});
   await chapter('取消场景摘要后重新导出，报告明确标记排除项。','Exclude the scene summary and export again. The report marks excluded sections.',async()=>{await panel.getByRole('checkbox',{name:'Include scene summary'}).uncheck();const pending=page.waitForEvent('download');await panel.getByRole('button',{name:'Export diagnostic bundle',exact:true}).click();await(await pending).saveAs(resolve(temporary,'diagnostics-without-scene.zip'));});
  }
  const durationSeconds=(Date.now()-started)/1000,video=page.video();await context.close();const file=`${topic}.webm`;await video.saveAs(resolve(output,file));
  const subtitles={};for(const [locale,key]of[['zh-CN','zh'],['en-US','en']]) {const name=`${topic}.${locale}.vtt`;subtitles[locale]=name;await writeFile(resolve(output,name),webVtt(captions,key));}
  manifest.videos=manifest.videos.filter(v=>v.topic!==topic);
  const sourceDigests=Object.fromEntries(await Promise.all(tutorialSources[topic].map(async path=>[path,sha((await readFile(path,'utf8')).replaceAll('\r\n','\n'))])));
  manifest.videos.push({topic,file,poster:`${topic}.png`,durationSeconds,subtitles,chapters:captions,recordedAt:new Date().toISOString(),productionIndexSha256:sha(await readFile('dist/index.html')),sourceDigests});
  for(const name of[file,`${topic}.png`,...Object.values(subtitles)])manifest.files[name]=sha(await readFile(resolve(output,name)));
  await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 }
 await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('[tutorial] Selected real UI recordings completed');
}finally{await browser.close();await server.close();}
await finalizeMedia();
