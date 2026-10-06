/**
 * The i18n guard's data-flow rule: hardcoded copy that reaches a UI call
 * through a variable or across lines.
 *
 * The line regexes in `check-i18n.mjs` see `toast('Saved')`, but not
 *
 *   const verb = op === 'fetch' ? 'Fetching' : 'Pulling'
 *   ui.setBusy(
 *     `${verb} ${name} (${n}/${total})`,
 *   )
 *
 * This walks the TypeScript AST instead. For every call to a sink (busy label,
 * toast, notice, dialog) it follows each argument back to its origins —
 * through `const` bindings, template literals, ternaries and `+` — and reports
 * any string literal on the way that reads as human copy.
 *
 * What keeps it precise:
 *   - Only `const` bindings are followed. A `let` can be reassigned, and
 *     guessing which value arrives would mean false positives.
 *   - A call ends the trail. `t()`/`interp()` are the right answer, and any
 *     other function is opaque — we do not guess what it returns.
 *   - Object-literal arguments (`{ key: 'fetch:…' }`) are options, not copy.
 *   - Name resolution is lexical: an inner parameter or binding with the same
 *     name shadows an outer const, as it does at runtime.
 *
 * What it cannot see: copy passed through a function parameter, a `let`, an
 * object property, a store field, or another module. Those need a type-level
 * check (a branded `Translated` string type), not a lint.
 */
import ts from 'typescript'

/** Callee names whose arguments are shown to the user. */
export const SINK_CALLS = ['setBusy', 'pushToast', 'toast', 'notify', 'showError', 'confirmDialog']

const SINK_RE = new RegExp(`\\b(${SINK_CALLS.join('|')})\\s*\\(`)

const MAX_HOPS = 8

/**
 * @param {string} text        file contents
 * @param {string} fileName    used for the TS script kind only
 * @param {(s: string) => boolean} isHumanCopy
 * @returns {{ line: number, col: number, kind: string, text: string }[]}
 */
export function findSinkViolations(text, fileName, isHumanCopy) {
  // Most files never call a sink; skip the parse for them.
  if (!SINK_RE.test(text)) return []
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind)
  const out = []
  const seen = new Set()

  const report = (node, sink, copy, via) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    const key = `${line}:${character}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      line: line + 1,
      col: character,
      kind: via.length ? `${sink} via ${via.join(' → ')}` : sink,
      text: copy
    })
  }

  /** Follow an expression to the literals it can evaluate to. */
  const trace = (expr, sink, via, hops) => {
    if (!expr || hops > MAX_HOPS) return
    switch (expr.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        if (isHumanCopy(expr.text)) report(expr, sink, expr.text, via)
        return
      case ts.SyntaxKind.TemplateExpression: {
        // The template's own words, with every `${…}` hole collapsed.
        const words = [expr.head.text, ...expr.templateSpans.map((s) => s.literal.text)].join(' ')
        if (isHumanCopy(words)) report(expr, sink, expr.getText(sf), via)
        for (const span of expr.templateSpans) trace(span.expression, sink, via, hops)
        return
      }
      case ts.SyntaxKind.ConditionalExpression:
        trace(expr.whenTrue, sink, via, hops)
        trace(expr.whenFalse, sink, via, hops)
        return
      case ts.SyntaxKind.BinaryExpression:
        if (expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
          trace(expr.left, sink, via, hops)
          trace(expr.right, sink, via, hops)
        } else if (
          expr.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
          expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
        ) {
          trace(expr.right, sink, via, hops)
        }
        return
      case ts.SyntaxKind.ParenthesizedExpression:
      case ts.SyntaxKind.AsExpression:
      case ts.SyntaxKind.SatisfiesExpression:
      case ts.SyntaxKind.NonNullExpression:
        trace(expr.expression, sink, via, hops)
        return
      case ts.SyntaxKind.Identifier: {
        const init = resolveConst(expr)
        if (init) trace(init, sink, [...via, expr.text], hops + 1)
        return
      }
      default:
        // Calls (t(), interp(), anything else), property reads, object
        // literals: not something we can or should guess about.
        return
    }
  }

  for (const call of collectSinkCalls(sf)) {
    const sink = calleeName(call)
    for (const arg of call.arguments) trace(arg, sink, [], 0)
  }
  return out
}

function calleeName(call) {
  const e = call.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return ''
}

function collectSinkCalls(sf) {
  const calls = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && SINK_CALLS.includes(calleeName(node))) calls.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return calls
}

/**
 * The initializer of the `const` the identifier refers to, or null when the
 * nearest binding of that name is anything else (a parameter, a `let`, a
 * destructured name, an import, a function).
 */
function resolveConst(id) {
  const name = id.text
  for (let scope = id.parent; scope; scope = scope.parent) {
    const binding = bindingIn(scope, name)
    if (binding === undefined) continue
    return binding
  }
  return null
}

/**
 * undefined — this scope does not bind `name`, keep walking out.
 * null      — it binds `name` to something we will not follow.
 * Node      — the initializer of a `const name = …` in this scope.
 */
function bindingIn(scope, name) {
  if (ts.isFunctionLike(scope)) {
    for (const p of scope.parameters ?? []) if (bindsName(p.name, name)) return null
    if (scope.name && ts.isIdentifier(scope.name) && scope.name.text === name) return null
  }
  if (ts.isCatchClause(scope) && scope.variableDeclaration && bindsName(scope.variableDeclaration.name, name))
    return null
  if (
    (ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) &&
    scope.initializer &&
    ts.isVariableDeclarationList(scope.initializer) &&
    scope.initializer.declarations.some((d) => bindsName(d.name, name))
  )
    return null

  const hasStatements =
    ts.isBlock(scope) ||
    ts.isSourceFile(scope) ||
    ts.isModuleBlock(scope) ||
    ts.isCaseClause(scope) ||
    ts.isDefaultClause(scope)
  if (!hasStatements) return undefined
  for (const st of scope.statements) {
    if (ts.isVariableStatement(st)) {
      const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0
      for (const d of st.declarationList.declarations) {
        if (!bindsName(d.name, name)) continue
        return isConst && ts.isIdentifier(d.name) && d.initializer ? d.initializer : null
      }
    } else if (
      (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) &&
      st.name?.text === name
    ) {
      return null
    } else if (ts.isImportDeclaration(st) && importsName(st, name)) {
      return null
    }
  }
  return undefined
}

function bindsName(binding, name) {
  if (ts.isIdentifier(binding)) return binding.text === name
  if (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding))
    return binding.elements.some((el) => !ts.isOmittedExpression(el) && bindsName(el.name, name))
  return false
}

function importsName(decl, name) {
  const clause = decl.importClause
  if (!clause) return false
  if (clause.name?.text === name) return true
  const nb = clause.namedBindings
  if (!nb) return false
  if (ts.isNamespaceImport(nb)) return nb.name.text === name
  return nb.elements.some((el) => el.name.text === name)
}
