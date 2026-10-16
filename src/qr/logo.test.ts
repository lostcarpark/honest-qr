import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { generateQr, type QrSymbol } from './generate'
import {
  blockDamage,
  centredArea,
  correctablePerBlock,
  DEFAULT_SAFETY,
  isProtected,
  isSafeArea,
  maxLogoSize,
  scaledLogoModules,
  type LogoArea,
} from './logo'

/** Rasterises a symbol to RGBA, letting `cover` override modules in an area. */
function rasterise(qr: QrSymbol, area: LogoArea, cover: (dark: boolean) => boolean, scale = 4) {
  const margin = 4
  const width = (qr.size + margin * 2) * scale
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255)
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      let dark = qr.data[r * qr.size + c] === 1
      const inArea =
        r >= area.start && r < area.start + area.size && c >= area.start && c < area.start + area.size
      if (inArea) dark = cover(dark)
      if (!dark) continue
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const offset = (((r + margin) * scale + y) * width + (c + margin) * scale + x) * 4
          pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0
        }
      }
    }
  }
  return { pixels, width }
}

function decode(qr: QrSymbol, area: LogoArea, cover: (dark: boolean) => boolean) {
  const { pixels, width } = rasterise(qr, area, cover)
  return jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' })?.data
}

const samples: Array<[string, number]> = [
  ['https://example.com', 1],
  ['https://example.com', 5],
  ['https://gitlab.com/some-group/some-project/-/merge_requests/1234', 1],
  ['https://example.com/a/rather/long/path?with=query&string=values&and=more#fragment', 10],
  ['https://example.com', 20],
]

describe('isProtected', () => {
  it('covers the finder patterns, separators and format info', () => {
    const n = 25
    expect(isProtected(0, 0, n)).toBe(true)
    expect(isProtected(8, 8, n)).toBe(true)
    expect(isProtected(0, n - 1, n)).toBe(true)
    expect(isProtected(8, n - 8, n)).toBe(true)
    expect(isProtected(n - 1, 0, n)).toBe(true)
    expect(isProtected(n - 8, 8, n)).toBe(true)
    expect(isProtected(n - 1, n - 1, n)).toBe(false)
  })

  it('covers the timing patterns', () => {
    expect(isProtected(6, 12, 25)).toBe(true)
    expect(isProtected(12, 6, 25)).toBe(true)
    expect(isProtected(12, 12, 25)).toBe(false)
  })

  it('covers version information from version 7', () => {
    const v7 = 45
    expect(isProtected(0, v7 - 11, v7)).toBe(true)
    expect(isProtected(v7 - 11, 0, v7)).toBe(true)
    expect(isProtected(0, 41 - 11, 41)).toBe(false)
  })
})

describe('maxLogoSize', () => {
  it.each(samples)('keeps every block within budget for %s (min version %i)', (text, minVersion) => {
    const qr = generateQr(text, minVersion)
    const size = maxLogoSize(qr)
    expect(size).toBeGreaterThanOrEqual(3)
    const budget = Math.floor(correctablePerBlock(qr.version) * DEFAULT_SAFETY)
    expect(Math.max(...blockDamage(qr, centredArea(qr.size, size)))).toBeLessThanOrEqual(budget)
  })

  it.each(samples)('returns the largest safe size for %s (min version %i)', (text, minVersion) => {
    const qr = generateQr(text, minVersion)
    const size = maxLogoSize(qr)
    expect(isSafeArea(qr, centredArea(qr.size, size + 2))).toBe(false)
  })

  it('never reaches the finder patterns', () => {
    for (const version of [1, 2, 3, 10, 40]) {
      const qr = generateQr('x', version)
      const area = centredArea(qr.size, maxLogoSize(qr))
      for (const corner of [0, qr.size - 9]) {
        // Finder plus separator occupy 0..8 / size-8..size-1 along each edge.
        expect(area.start).toBeGreaterThan(8)
        expect(area.start + area.size - 1).toBeLessThan(corner === 0 ? qr.size - 8 : qr.size)
      }
    }
  })

  it('allows a larger logo when a bigger version is requested', () => {
    const small = generateQr('https://example.com')
    const large = generateQr('https://example.com', 10)
    expect(maxLogoSize(large)).toBeGreaterThan(maxLogoSize(small))
  })

  it('allows a larger logo when less safety margin is kept', () => {
    const qr = generateQr('https://example.com', 6)
    expect(maxLogoSize(qr, 1)).toBeGreaterThan(maxLogoSize(qr, DEFAULT_SAFETY))
  })

  it('returns 0 when nothing fits', () => {
    expect(maxLogoSize(generateQr('x'), 0)).toBe(0)
  })
})

describe('decoding with the logo area obscured', () => {
  it.each(samples)('decodes %s (min version %i) with the area blanked', (text, minVersion) => {
    const qr = generateQr(text, minVersion)
    expect(decode(qr, centredArea(qr.size, maxLogoSize(qr)), () => false)).toBe(text)
  })

  it.each(samples)('decodes %s (min version %i) with every covered module wrong', (text, minVersion) => {
    // Worst case: the image happens to invert every module it covers.
    const qr = generateQr(text, minVersion)
    expect(decode(qr, centredArea(qr.size, maxLogoSize(qr)), (dark) => !dark)).toBe(text)
  })

  it('decodes with the logo plus extra damage up to the safety margin', () => {
    // Use the full correction capacity: the reserve really is available.
    const qr = generateQr('https://example.com', 8)
    expect(decode(qr, centredArea(qr.size, maxLogoSize(qr, 1)), (dark) => !dark)).toBe('https://example.com')
  })
})

describe('scaledLogoModules', () => {
  it.each([
    [17, 100, 17],
    [17, 50, 7],
    [17, 40, 5],
    [17, 20, 3],
    [17, 10, 0],
    [5, 100, 5],
    [0, 100, 0],
  ])('scales a maximum of %i at %i%% to %i', (max, percent, expected) => {
    expect(scaledLogoModules(max, percent)).toBe(expected)
  })
})
