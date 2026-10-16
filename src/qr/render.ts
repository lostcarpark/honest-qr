import type { QrSymbol } from './generate'
import { centredArea } from './logo'

export interface RenderOptions {
  /** Pixels per module. */
  scale?: number
  /** Quiet zone width in modules; the spec asks for 4. */
  margin?: number
  logo?: HTMLImageElement | null
  /** Side of the centred logo square in modules, including its white border. */
  logoModules?: number
  dark?: string
  light?: string
}

export function renderQr(qr: QrSymbol, options: RenderOptions = {}): HTMLCanvasElement {
  const { scale = 16, margin = 4, logo = null, logoModules = 0, dark = '#000', light = '#fff' } = options
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = (qr.size + margin * 2) * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')

  ctx.fillStyle = light
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const showLogo = logo !== null && logoModules >= 3
  const area = centredArea(qr.size, logoModules)
  const inLogo = (r: number, c: number) =>
    showLogo && r >= area.start && r < area.start + area.size && c >= area.start && c < area.start + area.size

  ctx.fillStyle = dark
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.data[r * qr.size + c] && !inLogo(r, c)) {
        ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale)
      }
    }
  }

  if (showLogo) {
    // Leave half a module of white on each side so the image doesn't merge
    // into the surrounding modules, then fit the image inside, keeping its shape.
    const box = (area.size - 1) * scale
    const ratio = Math.min(box / logo.naturalWidth, box / logo.naturalHeight)
    const w = logo.naturalWidth * ratio
    const h = logo.naturalHeight * ratio
    const centre = (margin + qr.size / 2) * scale
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(logo, centre - w / 2, centre - h / 2, w, h)
  }

  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/png')
  })
}
