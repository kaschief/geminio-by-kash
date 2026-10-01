import { useEffect, useState } from 'react'
import type { AIConfig, AIFeature } from '../../../shared/types'
import { aiApi } from '../infrastructure/api'
import { useSettingsStore } from '../stores/settings'

/**
 * Answers already asked for, per AI settings object and feature. A dozen AI
 * buttons can be on screen at once; they share one keychain lookup each, and a
 * settings change (a new `ai` object) starts fresh.
 */
const answers = new WeakMap<object, Map<AIFeature, Promise<boolean>>>()

function askReady(ai: AIConfig, feature: AIFeature): Promise<boolean> {
  let perFeature = answers.get(ai)
  if (!perFeature) {
    perFeature = new Map()
    answers.set(ai, perFeature)
  }
  let pending = perFeature.get(feature)
  if (!pending) {
    // Promise.resolve().then: a bridge that throws synchronously (an older main
    // process without this handler) becomes "not ready" instead of escaping the
    // caller's effect and taking the whole window down.
    pending = Promise.resolve()
      .then(() => aiApi.ready(useSettingsStore.getState().aiFor(feature)))
      .then((ok) => ok === true)
      .catch(() => false)
    perFeature.set(feature, pending)
  }
  return pending
}

/**
 * Whether an AI call for `feature` could run at all — AI switched on *and* a key
 * stored (or a provider that needs none). Every AI button and surface gates on
 * this, not on the on/off switch alone: with no key, a button's only possible
 * outcome is "No AI API key configured". The key lives in the OS keychain, which
 * only the main process can read, so the answer arrives asynchronously; it is
 * false until then — an AI button that appears a moment late beats one that is
 * offered and then only fails.
 */
export function useAiReady(feature: AIFeature): boolean {
  const ai = useSettingsStore((s) => s.activeProfile().ai)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (ai.enabled === false) {
      setReady(false)
      return
    }
    let live = true
    void askReady(ai, feature).then((ok) => live && setReady(ok))
    return () => {
      live = false
    }
  }, [ai, feature])
  return ready
}
