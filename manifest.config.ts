import { defineManifest } from '@crxjs/vite-plugin'

// The manifest is the extension's ID card. When you load the extension, Chrome
// reads this FIRST to learn: what it's called, what permissions it needs, which
// of our scripts run where. Nothing happens that isn't declared here.
export default defineManifest({
  manifest_version: 3, // MV3 = the current Chrome extension format.
  name: 'One Piece Plot Armor',
  version: '0.0.1',
  description: 'Blurs One Piece spoilers on social media, based on your current episode.',

  // The little window that opens when you click the extension's toolbar icon.
  action: {
    default_popup: 'src/popup/index.html',
  },

  // The cost/usage dashboard. Opened via right-click the extension icon →
  // "Options", or chrome://extensions → Details → Extension options.
  options_page: 'src/dashboard/index.html',

  // "Content scripts" are our code that Chrome injects INTO matching web pages,
  // where it can read and modify that page's DOM. This one runs on Reddit.
  content_scripts: [
    {
      matches: ['*://*.reddit.com/*'],
      js: ['src/content/reddit.ts'],
      run_at: 'document_idle', // wait until the page has mostly loaded.
    },
  ],

  // Permissions we must request up front. "storage" lets us save the user's
  // episode number so it persists between visits.
  permissions: ['storage'],
})
