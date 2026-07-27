import { scanAndBlur, resetBlur, OVERLAY_CSS } from './reddit-dom'

// This is the Reddit ADAPTER BOOTSTRAP. Chrome injects it into reddit.com pages.
// It owns only the browser-specific wiring: read the episode from storage, run
// the (pure, tested) DOM helpers, and re-run as the infinite-scroll SPA loads
// more content. All the "find candidates / blur / reset" logic lives in
// reddit-dom.ts so it can be unit-tested without a browser.

const STORAGE_KEY = 'currentEpisode'

let currentEpisode: number | null = null

// Inject our one <style> tag.
const style = document.createElement('style')
style.textContent = OVERLAY_CSS
document.documentElement.appendChild(style)

async function start() {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  currentEpisode = typeof result[STORAGE_KEY] === 'number' ? result[STORAGE_KEY] : null

  if (currentEpisode == null) {
    console.info('[Plot Armor] No episode set — click the extension icon to set one.')
    return
  }

  scanAndBlur(document, currentEpisode)

  // Reddit is an infinite-scroll single-page app: new comments load in as you
  // scroll, without a full page reload. A MutationObserver notifies us whenever
  // nodes are added to the DOM, so we can scan the new arrivals too.
  const observer = new MutationObserver((mutations) => {
    if (currentEpisode == null) return
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) scanAndBlur(node as Element, currentEpisode)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

// If the viewer changes their episode in the popup, re-run from scratch.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    const next = changes[STORAGE_KEY].newValue
    currentEpisode = typeof next === 'number' ? next : null
    resetBlur(document)
    if (currentEpisode != null) scanAndBlur(document, currentEpisode)
  }
})

start()
