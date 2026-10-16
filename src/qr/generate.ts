import QRCode from 'qrcode'

export interface QrSymbol {
  version: number
  size: number
  /** Row-major module values: 1 is dark. */
  data: Uint8Array
  /** Row-major flags marking function-pattern modules. */
  reservedBit: Uint8Array
}

export const MAX_VERSION = 40

/**
 * Encodes text at error-correction level H (about 30% recoverable). If
 * `minVersion` is larger than the version the text needs, the bigger symbol is
 * used, which leaves more room for a logo.
 */
export function generateQr(text: string, minVersion = 1): QrSymbol {
  let qr = QRCode.create(text, { errorCorrectionLevel: 'H' })
  if (minVersion > qr.version) {
    qr = QRCode.create(text, { errorCorrectionLevel: 'H', version: Math.min(minVersion, MAX_VERSION) })
  }
  const { size, data, reservedBit } = qr.modules
  return { version: qr.version, size, data, reservedBit }
}
