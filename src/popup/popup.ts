// The popup's only job: read and save the viewer's current episode number.
// We store it in chrome.storage.local — a small persistent key/value store
// that survives page reloads and browser restarts, and that our content
// script can also read.

const STORAGE_KEY = 'currentEpisode'

const input = document.getElementById('episode') as HTMLInputElement
const saveButton = document.getElementById('save') as HTMLButtonElement
const statusEl = document.getElementById('status') as HTMLDivElement

// On open, load any previously saved value so the field isn't blank.
chrome.storage.local.get(STORAGE_KEY, (result) => {
  const saved = result[STORAGE_KEY]
  if (typeof saved === 'number') input.value = String(saved)
})

saveButton.addEventListener('click', () => {
  const episode = parseInt(input.value, 10)
  if (!Number.isFinite(episode) || episode < 1) {
    statusEl.style.color = '#e0777d'
    statusEl.textContent = 'Enter a valid episode number.'
    return
  }
  chrome.storage.local.set({ [STORAGE_KEY]: episode }, () => {
    statusEl.style.color = '#7bd88f'
    statusEl.textContent = `Saved — watching through ep ${episode}.`
  })
})
