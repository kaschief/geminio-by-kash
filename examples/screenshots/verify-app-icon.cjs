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
const hasCustomIcon = () => {
  const attrs = execFileSync('/usr/bin/xattr', [bundle], { encoding: 'utf8' }).split('\n')
  if (!attrs.includes('com.apple.FinderInfo')) return false
  const info = execFileSync('/usr/bin/xattr', ['-px', 'com.apple.FinderInfo', bundle], { encoding: 'utf8' }).replace(/\s/g, '')
  return (Buffer.from(info, 'hex').readUInt16BE(8) & 0x400) !== 0
}
;(async () => {
  const userData = await fs.mkdtemp('/tmp/geminio-icon-lifecycle-')
  const settingsPath = join(userData, 'gitcito-settings.json')
  const savedIcon = async () => JSON.parse(await fs.readFile(settingsPath, 'utf8')).appIcon?.icon
  await fs.writeFile(settingsPath, JSON.stringify({ onboardingCompleted:true, autoFetchMinutes:0, profiles:[{id:'default', name:'Demo', ai:{enabled:false}}], activeProfileId:'default', tabs:[], activeTabId:null, appIcon:{icon:'portal'} }))
  await fs.writeFile(join(userData,'gitcito-keychain.json'), JSON.stringify({consent:'declined',explained:true}))
  const sealedBefore=hash(await fs.readFile(join(bundle,'Contents/Resources/app.asar')))
  let app
  const launch=async()=>{
    app=await _electron.launch({executablePath:join(bundle,'Contents/MacOS/Geminio'),args:['--shot','--background-test',`--user-data-dir=${userData}`],cwd:ROOT})
    const page=await app.firstWindow();await page.waitForFunction(()=>window.__shot?.ready)
    assert.deepEqual(await app.evaluate(({app,BrowserWindow})=>({packaged:app.isPackaged,visible:BrowserWindow.getAllWindows().some(w=>w.isVisible())})),{packaged:true,visible:false})
    return page
  }
  const choose=async(page,icon)=>{
    await page.evaluate(i=>window.__shot.settings.getState().update(s=>({...s,appIcon:{icon:i}})),icon)
    for(let i=0;i<200;i++){if(await savedIcon()===icon)break;await new Promise(r=>setTimeout(r,10))}
    assert.equal(await savedIcon(),icon,`${icon} must reach disk`)
  }
  try {
    // 1. A saved choice is applied at launch, so the app carries a custom icon.
    let page=await launch()
    await page.evaluate(async()=>window.api.settings.set(window.__shot.settings.getState().settings))
    const portal=iconHash()
    // 2. Change it and quit straight away, while the native write may still be pending. before-quit must drain it.
    await choose(page,'water')
    await app.close();app=null
    const water=iconHash();assert.notEqual(water,portal,'the new icon must be what Finder shows after quitting')
    // 3. Reopen: the choice and the Finder icon are both still there.
    page=await launch()
    await page.evaluate(async()=>window.api.settings.set(window.__shot.settings.getState().settings))
    assert.equal(iconHash(),water,'relaunching must not disturb the chosen icon')
    assert.equal(await page.evaluate(()=>window.__shot.settings.getState().settings.appIcon.icon),'water')
    // 4. Every icon in the set can be chosen and persisted, and each one looks different in Finder.
    // The native write is asynchronous: wait for Finder's icon to change, then to stop changing,
    // so a half-written icon is never mistaken for the result.
    const sleep=ms=>new Promise(r=>setTimeout(r,ms))
    const read=()=>{try{return iconHash()}catch{return null}}
    const settled=async from=>{
      for(let i=0;i<150;i++){
        await sleep(100)
        const first=read()
        if(first&&first!==from){await sleep(800);if(read()===first)return first}
      }
      return from
    }
    const seen=new Set([water]);let previous=water
    for(const icon of ['blueprint','mercury','topo']){
      await choose(page,icon)
      const now=await settled(previous)
      assert.notEqual(now,previous,`${icon} must replace the previous Finder icon`)
      seen.add(now);previous=now
    }
    assert.equal(seen.size,4,'each choice must produce its own Finder icon')
    // 5. Monoline is built into the bundle, so choosing it clears the custom icon.
    await choose(page,'monoline')
    await app.close();app=null
    assert.equal(hasCustomIcon(),false,'Monoline must restore the bundle icon')
    assert.equal(hash(await fs.readFile(join(bundle,'Contents/Resources/app.asar'))),sealedBefore)
    console.log('PASS packaged hidden lifecycle: persistence after quit, quit during update, reopen, every icon distinct, Monoline reset, unchanged signed app resources')
  } finally {if(app)await app.close();await fs.rm(userData,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1})
