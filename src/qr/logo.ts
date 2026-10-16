import { blockLayout, codewordMap, ecTable, versionFromSize, type ModuleLayout } from './codewords'

/**
 * Fraction of each block's correction capacity the logo may use. Half leaves
 * the other half for real-world damage: print defects, glare, a poor camera.
 */
export const DEFAULT_SAFETY = 0.5

/** A centred square of modules, `start` being its first row and column. */
export interface LogoArea {
  start: number
  size: number
}

export function centredArea(symbolSize: number, size: number): LogoArea {
  return { start: (symbolSize - size) / 2, size }
}

/**
 * Modules the logo must never cover: the three finder patterns with their
 * separators and format information, the timing patterns, and version info.
 * Alignment patterns are allowed, since from version 7 one sits dead centre.
 */
export function isProtected(row: number, col: number, symbolSize: number): boolean {
  const n = symbolSize
  const nearTop = row < 9
  const nearLeft = col < 9
  if ((nearTop && nearLeft) || (nearTop && col >= n - 8) || (row >= n - 8 && nearLeft)) return true
  if (row === 6 || col === 6) return true
  if (versionFromSize(n) >= 7) {
    if (row < 6 && col >= n - 11 && col < n - 8) return true
    if (col < 6 && row >= n - 11 && row < n - 8) return true
  }
  return false
}

/** Number of distinct codewords the area touches, per error-correction block. */
export function blockDamage(layout: ModuleLayout, area: LogoArea): number[] {
  const map = codewordMap(layout)
  const totalCodewords = map.reduce((max, codeword) => Math.max(max, codeword), -1) + 1
  const { blocks, codewordBlock } = blockLayout(versionFromSize(layout.size), totalCodewords)
  const touched = new Set<number>()
  for (let r = area.start; r < area.start + area.size; r++) {
    for (let c = area.start; c < area.start + area.size; c++) {
      const codeword = map[r * layout.size + c]
      if (codeword >= 0) touched.add(codeword)
    }
  }
  const damage = new Array<number>(blocks).fill(0)
  for (const codeword of touched) damage[codewordBlock[codeword]]++
  return damage
}

/** Codewords per block a Reed-Solomon decoder can repair (unknown positions). */
export function correctablePerBlock(version: number): number {
  return Math.floor(ecTable(version).ecPerBlock / 2)
}

export function isSafeArea(layout: ModuleLayout, area: LogoArea, safety = DEFAULT_SAFETY): boolean {
  const n = layout.size
  for (let r = area.start; r < area.start + area.size; r++) {
    for (let c = area.start; c < area.start + area.size; c++) {
      if (isProtected(r, c, n)) return false
    }
  }
  const budget = Math.floor(correctablePerBlock(versionFromSize(n)) * safety)
  return blockDamage(layout, area).every((d) => d <= budget)
}

/**
 * Largest centred square (in modules, including the white margin around the
 * image) that keeps every block within its damage budget. Symbols always have
 * odd width, so only odd sizes can be centred exactly. Returns 0 if none fit.
 */
export function maxLogoSize(layout: ModuleLayout, safety = DEFAULT_SAFETY): number {
  let best = 0
  for (let size = 1; size < layout.size; size += 2) {
    if (!isSafeArea(layout, centredArea(layout.size, size), safety)) break
    best = size
  }
  return best
}

/**
 * Largest odd module count no bigger than `percent` of `max`, or 0 when that
 * is under 3, as a 1-module square has no room inside its white border.
 */
export function scaledLogoModules(max: number, percent: number): number {
  const target = Math.floor((max * percent) / 100)
  const odd = target % 2 === 1 ? target : target - 1
  return odd >= 3 ? odd : 0
}
