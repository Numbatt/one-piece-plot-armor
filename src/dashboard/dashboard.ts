import { getUsageLog, clearUsageLog, type UsageEntry } from '../core/usage'

// The dashboard: reads the usage log from chrome.storage and renders totals +
// a table. Pure view code — it never calls a model, only displays what the
// classifier already logged. Auto-refreshes so you can watch it fill as you browse.

const fmtUsd = (n: number) => '$' + n.toFixed(n < 0.01 ? 5 : 2)
const fmtNum = (n: number) => n.toLocaleString()
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString()

function card(n: string, label: string): string {
  return `<div class="card"><div class="n">${n}</div><div class="l">${label}</div></div>`
}

async function render() {
  const log = await getUsageLog()

  const totals = log.reduce(
    (a, e) => {
      a.inTok += e.inputTokens
      a.outTok += e.outputTokens
      a.cost += e.costUsd
      if (e.spoiler) a.spoilers++
      a.sites.add(e.site)
      return a
    },
    { inTok: 0, outTok: 0, cost: 0, spoilers: 0, sites: new Set<string>() },
  )

  document.getElementById('cards')!.innerHTML = [
    card(fmtNum(log.length), 'comments checked'),
    card(fmtNum(totals.spoilers), 'flagged spoilers'),
    card(fmtNum(totals.inTok + totals.outTok), 'tokens spent'),
    card(fmtUsd(totals.cost), 'total cost'),
    card(log.length ? fmtUsd(totals.cost / log.length) : '$0', 'per comment'),
  ].join('')

  document.getElementById('sites')!.textContent = totals.sites.size
    ? `across ${[...totals.sites].join(', ')}`
    : ''

  const empty = document.getElementById('empty')!
  empty.style.display = log.length ? 'none' : 'block'

  // Most recent first; cap the rendered rows so a long session stays snappy.
  const rows = [...log].reverse().slice(0, 300)
  document.getElementById('rows')!.innerHTML = rows
    .map((e: UsageEntry) => {
      const snippet = e.textSnippet.replace(/</g, '&lt;')
      const verdict = e.spoiler ? '<span class="yes">spoiler</span>' : '<span class="no">clear</span>'
      return `<tr>
        <td>${fmtTime(e.ts)}</td><td>${e.site}</td><td class="text" title="${snippet}">${snippet}</td>
        <td>${verdict}</td><td>${e.model}</td><td>${e.inputTokens}</td><td>${e.outputTokens}</td>
        <td>${e.ms}</td><td>${fmtUsd(e.costUsd)}</td>
      </tr>`
    })
    .join('')
}

document.getElementById('refresh')!.addEventListener('click', render)
document.getElementById('clear')!.addEventListener('click', async () => {
  if (confirm('Clear the whole usage log?')) {
    await clearUsageLog()
    render()
  }
})

render()
setInterval(render, 3000) // live-update while you browse
