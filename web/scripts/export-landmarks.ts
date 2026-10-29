/**
 * Writes every model in src/landmarks/models.ts to public/models/<slug>.glb.
 * Run with `npm run models`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { LANDMARK_MODELS } from '../src/landmarks/models'

// GLTFExporter reads its binary output through the browser's FileReader
class NodeFileReader {
  result: ArrayBuffer | string | null = null
  onload: (() => void) | null = null
  onloadend: (() => void) | null = null
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((buf) => this.finish(buf))
  }
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((buf) => this.finish(`data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`))
  }
  private finish(result: ArrayBuffer | string) {
    this.result = result
    this.onload?.()
    this.onloadend?.()
  }
}
Object.assign(globalThis, { FileReader: NodeFileReader })

// The bundled script runs from node_modules/.cache, so resolve from the working directory (web/)
const outDir = resolve(process.cwd(), 'public', 'models')
mkdirSync(outDir, { recursive: true })

const exporter = new GLTFExporter()
for (const model of LANDMARK_MODELS) {
  const scene = model.build()
  const glb = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer
  writeFileSync(resolve(outDir, `${model.slug}.glb`), Buffer.from(glb))
  console.log(`${model.slug}.glb  ${(glb.byteLength / 1024).toFixed(0)} KB`)
}
