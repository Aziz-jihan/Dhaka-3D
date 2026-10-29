/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full URL of dhaka.pmtiles when it is hosted outside the site (e.g. Cloudflare R2) */
  readonly VITE_BUILDINGS_URL?: string
}
