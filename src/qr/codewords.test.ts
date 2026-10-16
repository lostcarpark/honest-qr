import { createRequire } from 'node:module'
import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'
import { blockLayout, codewordMap, ecTable } from './codewords'
import { generateQr, type QrSymbol } from './generate'

// The encoder's own tables, used as the reference for our copy.
const require = createRequire(import.meta.url)
const ecCode = require('qrcode/lib/core/error-correction-code')
const ecLevel = require('qrcode/lib/core/error-correction-level')
const utils = require('qrcode/lib/core/utils')

const versions = Array.from({ length: 40 }, (_, i) => i + 1)

describe('ecTable', () => {
  it.each(versions)('matches the encoder for version %i', (version) => {
    const blocks = ecCode.getBlocksCount(version, ecLevel.H)
    const { blocks: ourBlocks, ecPerBlock } = ecTable(version)
    expect(ourBlocks).toBe(blocks)
    expect(ecPerBlock * blocks).toBe(ecCode.getTotalCodewordsCount(version, ecLevel.H))
  })

  it('rejects unknown versions', () => {
    expect(() => ecTable(0)).toThrow(/Unsupported/)
    expect(() => ecTable(41)).toThrow(/Unsupported/)
  })
})

describe('codewordMap', () => {
  it.each([1, 2, 7, 14, 25, 40])('puts exactly 8 modules in every codeword for version %i', (version) => {
    const qr = generateQr('x', version)
    const map = codewordMap(qr)
    const total = utils.getSymbolTotalCodewords(version)
    const counts = new Array<number>(total).fill(0)
    for (const codeword of map) if (codeword >= 0) counts[codeword]++
    expect(counts.every((count) => count === 8)).toBe(true)
  })

  it('never assigns function-pattern modules', () => {
    const qr = generateQr('https://example.com', 10)
    const map = codewordMap(qr)
    for (let i = 0; i < map.length; i++) {
      if (qr.reservedBit[i]) expect(map[i]).toBe(-1)
    }
  })
})

describe('blockLayout', () => {
  it('assigns each block its share of data and EC codewords', () => {
    // Version 5-H: 4 blocks, 2 of 11 data codewords and 2 of 12, 22 EC each.
    const layout = blockLayout(5, 134)
    const counts = new Array<number>(layout.blocks).fill(0)
    for (const block of layout.codewordBlock) counts[block]++
    expect(counts).toEqual([33, 33, 34, 34])
  })

  it('interleaves data codewords across blocks', () => {
    const layout = blockLayout(5, 134)
    expect([...layout.codewordBlock.slice(0, 8)]).toEqual([0, 1, 2, 3, 0, 1, 2, 3])
    // 46 data codewords: the long blocks add one each at 44-45, then EC begins.
    expect([...layout.codewordBlock.slice(42, 50)]).toEqual([2, 3, 2, 3, 0, 1, 2, 3])
  })
})

describe('codeword and block mapping against a real decoder', () => {
  /** Inverts every module of the first `count` codewords belonging to `block`. */
  function damageBlock(qr: QrSymbol, block: number, count: number): QrSymbol {
    const map = codewordMap(qr)
    const total = Math.max(...map) + 1
    const { codewordBlock } = blockLayout(qr.version, total)
    const targets = new Set<number>()
    for (let codeword = 0; codeword < total && targets.size < count; codeword++) {
      if (codewordBlock[codeword] === block) targets.add(codeword)
    }
    const data = qr.data.slice()
    for (let i = 0; i < map.length; i++) if (targets.has(map[i])) data[i] ^= 1
    return { ...qr, data }
  }

  function decode(qr: QrSymbol): string | undefined {
    const scale = 4
    const width = (qr.size + 8) * scale
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255)
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const r = Math.floor(y / scale) - 4
        const c = Math.floor(x / scale) - 4
        if (r >= 0 && c >= 0 && r < qr.size && c < qr.size && qr.data[r * qr.size + c]) {
          pixels.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3)
        }
      }
    }
    return jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' })?.data
  }

  // Version 5-H: 4 blocks, 22 EC codewords each, so 11 errors per block are repairable.
  const text = 'https://example.com/check'
  const qr = generateQr(text, 5)

  it.each([0, 3])('decodes with 11 wrong codewords in block %i', (block) => {
    expect(decode(damageBlock(qr, block, 11))).toBe(text)
  })

  it.each([0, 3])('fails with 12 wrong codewords in block %i', (block) => {
    expect(decode(damageBlock(qr, block, 12))).not.toBe(text)
  })
})
