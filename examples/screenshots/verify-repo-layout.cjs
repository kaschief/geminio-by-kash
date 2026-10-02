// Hidden, frame-by-frame repository switch checks under 4x CPU slowdown.
// ELECTRON_RENDERER_URL=http://localhost:5173 node examples/screenshots/verify-repo-layout.cjs
const { _electron } = require('playwright')
const fs = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const ROOT = join(__dirname, '../..')
;(async () => {
  const tmp = await fs.mkdtemp('/tmp/geminio-repo-views-')
  // Optional real repositories are inspected read-only; all mutations below
  // remain confined to disposable fixtures.
  const realPaths = process.env.LAYOUT_REPOS ? JSON.parse(process.env.LAYOUT_REPOS) : null
  const paths = realPaths ?? [join(tmp, 'a'), join(tmp, 'b')]
  const file = process.env.LAYOUT_FILE || 'same.ts'
  const names = realPaths ? paths.map(p=>p.split('/').pop()) : ['Repo A','Repo B']
  const userData = join(tmp, 'settings')
  for (const [index, repo] of (realPaths ? [] : paths).entries()) {
    await fs.cp(join(ROOT, 'examples/playground/line-staging'), repo, { recursive: true })
    const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    await fs.writeFile(join(repo, 'same.ts'), Array.from({ length: 220 }, (_, i) => `export const repo${index}Value${i} = ${i}`).join('\n'))
    git('add', '.'); git('-c', 'user.name=Demo', '-c', 'user.email=demo@example.com', 'commit', '-qm', `Repo ${index} baseline`)
    await fs.writeFile(join(repo, 'same.ts'), Array.from({ length: 220 }, (_, i) => `export const repo${index}Value${i} = ${i + 1000}`).join('\n'))
    git('add', '.'); git('-c', 'user.name=Demo', '-c', 'user.email=demo@example.com', 'commit', '-qm', `Repo ${index} changes`)
    await fs.writeFile(join(repo, 'same.ts'), Array.from({ length: 220 }, (_, i) => `export const repo${index}Value${i} = ${i + 2000}`).join('\n'))
  }
  await fs.mkdir(userData)
  await fs.writeFile(join(userData, 'gitcito-settings.json'), JSON.stringify({ onboardingCompleted: true, autoFetchMinutes: 0, themeMode: realPaths ? 'light' : 'dark', appThemeId: realPaths ? 'solarized' : 'geminio', fileListView: 'path', profiles: [{ id: 'default', name: 'Demo', ai: { enabled: false } }], activeProfileId: 'default', tabs: paths.map((path, i) => ({ id: String(i), kind: 'repo', name: names[i], repos: [{ path, name: names[i] }], activeRepoPath: path })), activeTabId: '0' }))
  await fs.writeFile(join(userData, 'gitcito-keychain.json'), JSON.stringify({ consent: 'declined', explained: true }))
  let app
  try {
    app = await _electron.launch({ args: [join(ROOT, 'out/main/index.js'), '--shot', '--background-test', `--user-data-dir=${userData}`], cwd: ROOT })
    const page = await app.firstWindow()
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForFunction(() => window.__shot?.ready)
    for (const path of paths) await page.evaluate((p) => window.__shot.waitForRepo(p), path)
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setContentSize(1440, 900) })
    const cdp = await page.context().newCDPSession(page)
    const recording = process.env.LAYOUT_RECORD_DIR
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: recording ? 1 : 4 })
    const videoFrames=[]
    if (recording) {
      await fs.mkdir(recording, {recursive:true})
      cdp.on('Page.screencastFrame', event => {
        videoFrames.push({data:event.data, time:event.metadata.timestamp})
        void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{})
      })
    }
    const mode = process.env.TEST_FILE_MODE || 'file'
    await page.evaluate(({p,mode,file,real}) => {
      if(real) window.__shot.ui.getState().setSidebarCollapsed(true)
      window.__shot.repo.getState().select(p, { type: 'wip' })
      window.__shot.ui.getState().setFileView({ repoPath:p, file, source:{type:'wip',staged:false,untracked:false}, mode })
    }, {p:paths[0],mode,file,real:!!realPaths})
    await page.locator(mode==='file' ? '.file-content' : '.diff-viewer').waitFor()
    await page.waitForTimeout(800)
    await page.locator('.fv-body').evaluate((el,top) => { el.scrollTop=top }, realPaths ? 0 : 500)
    const expectedTop=await page.locator('.fv-body').evaluate(el=>el.scrollTop)
    const hadSummary=await page.locator('.sem-root').count()>0
    if(recording) { await cdp.send('Page.startScreencast',{format:'png',maxWidth:1440,maxHeight:900,everyNthFrame:1}); await page.waitForTimeout(900) }
    await page.locator('.tab-name').filter({hasText:names[1]}).click()
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      window.layoutFrames=[]
      let start
      const frame=(now)=>{
        start ??= now
        const rect=(sel)=>{const el=document.querySelector(sel); if(!el)return null; const r=el.getBoundingClientRect(); return [r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10)}
        window.layoutFrames.push({ t:Math.round(now-start), repo:window.__shot.ui.getState().activeRepoPath, panel:rect('.right-panel'), header:rect('.fv-header'), controls:rect('.fv-controls'), message:rect('.commit-message'), content:!!document.querySelector('.file-content, .diff-viewer'), summary:!!document.querySelector('.sem-root'), top:document.querySelector('.fv-body')?.scrollTop })
        if(now-start<1500)requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    await page.locator('.tab-name').filter({hasText:names[0]}).click()
    await page.waitForTimeout(1700)
    const frames=await page.evaluate(()=>window.layoutFrames)
    await fs.writeFile('/tmp/geminio-layout-frames.json',JSON.stringify(frames,null,2))
    const restored=frames.filter(f=>f.repo===paths[0])
    assert.ok(restored.length>3)
    assert.ok(restored.every(f=>Math.abs(f.panel[2]-420)<1), 'restored panel must have its final width on every frame')
    assert.ok(restored.every(f=>f.header.every((v,i)=>Math.abs(v-restored.at(-1).header[i])<1)), 'file header must not move or resize after returning: '+JSON.stringify(restored.slice(0,8)))
    assert.ok(restored.every(f=>f.content), 'return must paint the previous content immediately, without a loading frame')
    assert.ok(restored.filter(f=>f.content).every(f=>f.top===expectedTop), 'file must never paint at the top before restoring scroll')
    if(hadSummary) assert.ok(restored.every(f=>f.summary), 'semantic summary must not disappear and push the diff down again')
    console.log('PASS every restored frame: stable panel/header geometry, content already present, saved scroll position')
    await page.screenshot({path:'/tmp/geminio-layout.png'})
    assert.deepEqual(errors,[])
    if(recording) {
      await cdp.send('Page.stopScreencast')
      videoFrames.sort((a,b)=>a.time-b.time)
      const manifest=[]
      for(let i=0;i<videoFrames.length;i++) {
        const filename=`frame-${String(i).padStart(4,'0')}.png`
        await fs.writeFile(join(recording,filename),Buffer.from(videoFrames[i].data,'base64'))
        manifest.push(`file '${filename}'`, `duration ${i+1<videoFrames.length ? Math.max(.001,videoFrames[i+1].time-videoFrames[i].time) : 1}`)
      }
      manifest.push(`file 'frame-${String(videoFrames.length-1).padStart(4,'0')}.png'`)
      await fs.writeFile(join(recording,'frames.txt'),manifest.join('\n'))
      await fs.writeFile(join(recording,'timings.json'),JSON.stringify(videoFrames.map((f,i)=>({frame:i,time:f.time-videoFrames[0].time})),null,2))
      console.log(`Recorded ${videoFrames.length} frames in ${recording}`)
    }
    if(!realPaths) {
      await page.locator('.tab-name').filter({hasText:names[1]}).click()
      await fs.appendFile(join(paths[0],file), '\nexport const changedWhileAway = true\n')
      await page.locator('.tab-name').filter({hasText:names[0]}).click()
      await page.waitForFunction(() => document.querySelector('.fv-body')?.textContent.includes('changedWhileAway'))
      console.log('PASS background refresh picks up edits made while the repository was away')
    }
  } finally { if(app)await app.close(); await fs.rm(tmp,{recursive:true,force:true}) }
})().catch(err=>{console.error(err);process.exitCode=1})
