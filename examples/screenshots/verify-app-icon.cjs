// Exercise the packaged app without showing a window or touching user settings.
const { _electron } = require('playwright')
const fs = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const ROOT = resolve(__dirname, '../..')
const bundle = process.env.ICON_TEST_BUNDLE || join(ROOT, 'dist/mac-arm64/Geminio.app')
const hash = b => createHash('sha256').update(b).digest('hex')
const iconHash = () => hash(execFileSync('/usr/bin/xattr', ['-px', 'com.apple.ResourceFork', join(bundle, 'Icon\r')], { maxBuffer: 8 * 1024 * 1024 }))
;(async () => {
  const userData = await fs.mkdtemp('/tmp/kash-icon-lifecycle-')
  const settingsPath = join(userData, 'gitcito-settings.json')
  await fs.writeFile(settingsPath, JSON.stringify({ onboardingCompleted:true, autoFetchMinutes:0, profiles:[{id:'default', name:'Demo', ai:{enabled:false}}], activeProfileId:'default', tabs:[], activeTabId:null, appIcon:{style:'monogram',color:'ocean'} }))
  await fs.writeFile(join(userData,'gitcito-keychain.json'), JSON.stringify({consent:'declined',explained:true}))
  const avatar='https://avatars.githubusercontent.com/u/1?s=512'
  await fs.mkdir(join(userData,'app-icons'))
  await fs.copyFile(join(ROOT,'resources/icon.png'), join(userData,'app-icons',`github-${hash(avatar).slice(0,24)}.png`))
  const sealedBefore=hash(await fs.readFile(join(bundle,'Contents/Resources/app.asar')))
  let app
  const launch=async()=>{
    app=await _electron.launch({executablePath:join(bundle,'Contents/MacOS/Geminio'),args:['--shot','--background-test',`--user-data-dir=${userData}`],cwd:ROOT})
    const page=await app.firstWindow();await page.waitForFunction(()=>window.__shot?.ready)
    assert.deepEqual(await app.evaluate(({app,BrowserWindow})=>({packaged:app.isPackaged,visible:BrowserWindow.getAllWindows().some(w=>w.isVisible())})),{packaged:true,visible:false})
    return page
  }
  try {
    let page=await launch()
    await page.evaluate(async()=>window.api.settings.set(window.__shot.settings.getState().settings))
    const initial=iconHash()
    // Start a native write, then quit while it is pending. before-quit must drain it.
    await page.evaluate(()=>window.__shot.settings.getState().update(s=>({...s,appIcon:{style:'branch',color:'rose'}})))
    for(let i=0;i<100;i++) {if(JSON.parse(await fs.readFile(settingsPath,'utf8')).appIcon.style==='branch')break;await new Promise(r=>setTimeout(r,10))}
    await app.close();app=null
    const changed=iconHash();assert.notEqual(changed,initial)
    page=await launch()
    await page.evaluate(async()=>window.api.settings.set(window.__shot.settings.getState().settings))
    assert.equal(iconHash(),changed)
    assert.equal(await page.evaluate(()=>window.__shot.settings.getState().settings.appIcon.style),'branch')
    await page.evaluate(async avatar=>{window.__shot.settings.getState().update(s=>({...s,appIcon:{style:'github',color:'violet',githubAvatarUrl:avatar}}));await window.api.settings.set(window.__shot.settings.getState().settings)},avatar)
    await app.close();app=null
    assert.notEqual(iconHash(),changed,'cached GitHub photo must also persist after exit')
    page=await launch()
    await page.evaluate(async()=>{window.__shot.settings.getState().update(s=>({...s,appIcon:{style:'classic',color:'violet'}}));await window.api.settings.set(window.__shot.settings.getState().settings)})
    await app.close();app=null
    let info='00'.repeat(32)
    const attrs=execFileSync('/usr/bin/xattr',[bundle],{encoding:'utf8'}).split('\n')
    if(attrs.includes('com.apple.FinderInfo')) info=execFileSync('/usr/bin/xattr',['-px','com.apple.FinderInfo',bundle],{encoding:'utf8'}).replace(/\s/g,'')
    assert.equal(Buffer.from(info,'hex').readUInt16BE(8)&0x400,0)
    assert.equal(hash(await fs.readFile(join(bundle,'Contents/Resources/app.asar'))),sealedBefore)
    console.log('PASS packaged hidden lifecycle: persistence after quit, quit during update, reopen, cached GitHub photo, Classic reset, unchanged signed app resources')
  } finally {if(app)await app.close();await fs.rm(userData,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1})
