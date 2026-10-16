import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateQr } from './generate'
import { centredArea, maxLogoSize } from './logo'
import { canvasToBlob, renderQr } from './render'

/** jsdom has no canvas, so record the drawing calls instead. */
function mockContext() {
  const ctx = {
    fillStyle: '',
    imageSmoothingQuality: '',
    fills: [] as Array<{ x: number; y: number; w: number; h: number; style: string }>,
    fillRect(x: number, y: number, w: number, h: number) {
      this.fills.push({ x, y, w, h, style: this.fillStyle })
    },
    drawImage: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  return ctx
}

function fakeImage(width: number, height: number) {
  return { naturalWidth: width, naturalHeight: height } as HTMLImageElement
}

afterEach(() => vi.restoreAllMocks())

describe('renderQr', () => {
  const qr = generateQr('https://example.com', 5)

  it('sizes the canvas for the symbol plus quiet zone', () => {
    mockContext()
    const canvas = renderQr(qr, { scale: 10, margin: 4 })
    expect(canvas.width).toBe((qr.size + 8) * 10)
    expect(canvas.height).toBe(canvas.width)
  })

  it('draws one square per dark module on a light background', () => {
    const ctx = mockContext()
    renderQr(qr, { scale: 2, margin: 1, dark: '#123', light: '#fed' })
    const [background, ...modules] = ctx.fills
    expect(background).toEqual({ x: 0, y: 0, w: (qr.size + 2) * 2, h: (qr.size + 2) * 2, style: '#fed' })
    expect(modules).toHaveLength(qr.data.filter((bit) => bit === 1).length)
    expect(modules.every((fill) => fill.style === '#123' && fill.w === 2)).toBe(true)
  })

  it('leaves the logo area clear and draws the image inside it, keeping its shape', () => {
    const ctx = mockContext()
    const scale = 10
    const margin = 4
    const logoModules = maxLogoSize(qr)
    const area = centredArea(qr.size, logoModules)
    renderQr(qr, { scale, margin, logo: fakeImage(200, 100), logoModules })

    const lo = (area.start + margin) * scale
    const hi = (area.start + area.size + margin) * scale
    const modules = ctx.fills.slice(1)
    expect(modules.some((f) => f.x >= lo && f.x < hi && f.y >= lo && f.y < hi)).toBe(false)

    const box = (logoModules - 1) * scale
    const centre = (margin + qr.size / 2) * scale
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), centre - box / 2, centre - box / 4, box, box / 2)
  })

  it('ignores a logo when there is no room for one', () => {
    const ctx = mockContext()
    renderQr(qr, { logo: fakeImage(10, 10), logoModules: 1 })
    expect(ctx.drawImage).not.toHaveBeenCalled()
    expect(ctx.fills).toHaveLength(1 + qr.data.filter((bit) => bit === 1).length)
  })

  it('throws if the canvas has no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() => renderQr(qr)).toThrow(/Canvas 2D context/)
  })
})

describe('canvasToBlob', () => {
  it('resolves with a PNG blob', async () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    const canvas = document.createElement('canvas')
    const toBlob = vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(blob))
    await expect(canvasToBlob(canvas)).resolves.toBe(blob)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
  })

  it('rejects when encoding fails', async () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(null))
    await expect(canvasToBlob(canvas)).rejects.toThrow(/Could not encode/)
  })
})
