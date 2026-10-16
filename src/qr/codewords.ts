/**
 * Maps every module of a QR symbol to the Reed-Solomon block it belongs to,
 * so we can work out exactly how much damage an overlay does to each block.
 */

/** Number of error-correction blocks for level H, indexed by version - 1. */
const H_BLOCKS = [
  1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40,
  42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
]

/** Error-correction codewords per block for level H, indexed by version - 1. */
const H_EC_PER_BLOCK = [
  17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
]

/** Minimal view of a module matrix: size plus a flag per function-pattern module. */
export interface ModuleLayout {
  size: number
  reservedBit: ArrayLike<number | boolean>
}

export interface BlockLayout {
  blocks: number
  ecPerBlock: number
  totalCodewords: number
  /** Block index for each codeword in the final interleaved sequence. */
  codewordBlock: Int32Array
}

export function versionFromSize(size: number): number {
  return (size - 17) / 4
}

export function ecTable(version: number): { blocks: number; ecPerBlock: number } {
  const blocks = H_BLOCKS[version - 1]
  const ecPerBlock = H_EC_PER_BLOCK[version - 1]
  if (blocks === undefined || ecPerBlock === undefined) {
    throw new Error(`Unsupported QR version ${version}`)
  }
  return { blocks, ecPerBlock }
}

export function blockLayout(version: number, totalCodewords: number): BlockLayout {
  const { blocks, ecPerBlock } = ecTable(version)
  const dataTotal = totalCodewords - blocks * ecPerBlock
  const shortData = Math.floor(dataTotal / blocks)
  const longBlocks = dataTotal % blocks
  const dataLength = (b: number) => (b < blocks - longBlocks ? shortData : shortData + 1)

  // Same interleaving order as the encoder: data codewords column by column
  // across blocks (short blocks drop out of the last column), then EC codewords.
  const codewordBlock = new Int32Array(totalCodewords)
  let index = 0
  for (let i = 0; i <= shortData; i++) {
    for (let b = 0; b < blocks; b++) {
      if (i < dataLength(b)) codewordBlock[index++] = b
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < blocks; b++) codewordBlock[index++] = b
  }
  return { blocks, ecPerBlock, totalCodewords, codewordBlock }
}

/**
 * Returns the codeword index stored in each module (row-major), or -1 for
 * function patterns and the unused remainder bits.
 */
export function codewordMap(layout: ModuleLayout): Int32Array {
  const { size, reservedBit } = layout
  const map = new Int32Array(size * size).fill(-1)
  let dataModules = 0
  for (let i = 0; i < size * size; i++) if (!reservedBit[i]) dataModules++
  const totalCodewords = Math.floor(dataModules / 8)

  // Standard zig-zag placement: two-column strips from the right edge,
  // alternating upwards and downwards, skipping the vertical timing pattern.
  let bit = 0
  let row = size - 1
  let direction = -1
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (;;) {
      for (let c = 0; c < 2; c++) {
        const index = row * size + col - c
        if (!reservedBit[index]) {
          const codeword = bit >> 3
          if (codeword < totalCodewords) map[index] = codeword
          bit++
        }
      }
      row += direction
      if (row < 0 || row >= size) {
        row -= direction
        direction = -direction
        break
      }
    }
  }
  return map
}
