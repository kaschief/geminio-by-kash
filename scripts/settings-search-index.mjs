// Index copy from the actual settings components without mounting them or
// triggering their network/keychain effects. Run before dev/build.
import ts from 'typescript'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
const root = resolve('src/renderer/src')
const enSource = ts.createSourceFile('en.ts', readFileSync(resolve(root, 'i18n/en.ts'), 'utf8'), ts.ScriptTarget.Latest, true)
const keys = new Set()
function dictionary(node) {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) keys.add(node.name.text)
  ts.forEachChild(node, dictionary)
}
dictionary(enSource)
const modules = new Map()
function moduleAt(file) {
  if (modules.has(file)) return modules.get(file)
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declarations = new Map(), imports = new Map()
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node)
    if (ts.isVariableStatement(node)) for (const d of node.declarationList.declarations) if (ts.isIdentifier(d.name)) declarations.set(d.name.text, d)
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.startsWith('.')) {
      const base = resolve(dirname(file), node.moduleSpecifier.text)
      const target = [base + '.tsx', base + '.ts'].find(existsSync)
      const bindings = node.importClause?.namedBindings
      if (target && bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) imports.set(item.name.text, [target, item.propertyName?.text ?? item.name.text])
    }
  }
  const data = { declarations, imports }; modules.set(file, data); return data
}
function collect(file, symbol, seen = new Set(), found = new Set(), skip = new Set()) {
  if (skip.has(symbol) || seen.has(file + ':' + symbol)) return found
  seen.add(file + ':' + symbol)
  const mod = moduleAt(file), node = mod.declarations.get(symbol)
  if (!node) return found
  function visit(n) {
    if (ts.isStringLiteral(n) && keys.has(n.text)) found.add(n.text)
    if (ts.isTemplateExpression(n) && n.head.text.includes('.')) {
      for (const key of keys) if (key.startsWith(n.head.text)) found.add(key)
    }
    // Follow local helpers/constants, plus imported UI components and tables.
    // Never traverse store hooks, API adapters, or the settings panel itself.
    if (ts.isIdentifier(n) && n.text !== symbol && n.text !== 'SettingsPanel') {
      if (mod.declarations.has(n.text)) collect(file, n.text, seen, found, skip)
      else if (/^[A-Z]/.test(n.text) && mod.imports.has(n.text)) collect(...mod.imports.get(n.text), seen, found, skip)
    }
    ts.forEachChild(n, visit)
  }
  visit(node); return found
}
const panel = resolve(root, 'components/SettingsPanel.tsx')
const repo = resolve(root, 'components/RepoSettingsModal.tsx')
const entries = []
const pages = { general:'GeneralPage', themes:'ThemesPage', layout:'LayoutPage', graph:'GraphPage', files:'FilesPage', profile:'ProfilePage', workspaces:'WorkspacesPage', integrations:'IntegrationsPage', ai:'AIPage', security:'SecurityPage', shortcuts:'ShortcutsPage', data:'DataPage' }
for (const [page, component] of Object.entries(pages)) entries.push({ page, ...(page === 'themes' ? { tab:'theme' } : {}), keys:[...collect(panel, component, new Set(), new Set(), new Set(['GraphStyleTab']))].sort() })
// Secondary tabs are separate destinations, so a match opens the right tab.
const graphComponent = [...moduleAt(panel).declarations.keys()].find(k => k === 'GraphStyleTab')
if (graphComponent) entries.push({ page:'themes', tab:'graph', keys:[...collect(panel, graphComponent)].sort() })
for (const [tab, component] of Object.entries({ general:'GeneralTab', config:'RepoConfigTab', info:'RepoInfoTab', vault:'RepoVaultTab', analytics:'AnalyticsSection', history:'RepoHistorySection', logs:'RepoLogsTab' })) {
  const imported = moduleAt(repo).imports.get(component)
  entries.push({ page:'repository', tab, keys:[...collect(...(imported ?? [repo, component]))].sort() })
}
writeFileSync(resolve(root, 'lib/settingsSearch.generated.json'), JSON.stringify(entries, null, 2) + '\n')
console.log(`Indexed ${entries.length} settings destinations`)
