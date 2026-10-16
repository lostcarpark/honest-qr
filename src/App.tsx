import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { generateQr, MAX_VERSION, type QrSymbol } from './qr/generate'
import { blockDamage, centredArea, correctablePerBlock, maxLogoSize, scaledLogoModules } from './qr/logo'
import { canvasToBlob, renderQr } from './qr/render'
import './App.css'

type Status = { kind: 'idle' } | { kind: 'ok' | 'error'; message: string }

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image.'))
    }
    image.src = url
  })
}

function App() {
  const [text, setText] = useState('https://example.com')
  const [minVersion, setMinVersion] = useState(1)
  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoPercent, setLogoPercent] = useState(100)
  // Changing the key resets the file input, so the same file can be chosen again.
  const [fileInputKey, setFileInputKey] = useState(0)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const result = useMemo((): { qr: QrSymbol } | { error: string } | null => {
    if (!text.trim()) return null
    try {
      return { qr: generateQr(text, minVersion) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [text, minVersion])

  const qr = result && 'qr' in result ? result.qr : null
  const maxModules = useMemo(() => (qr ? maxLogoSize(qr) : 0), [qr])
  const logoModules = logo ? scaledLogoModules(maxModules, logoPercent) : 0
  const worstDamage = useMemo(
    () => (qr && logoModules ? Math.max(...blockDamage(qr, centredArea(qr.size, logoModules))) : 0),
    [qr, logoModules],
  )

  const imageUrl = useMemo(
    () => (qr ? renderQr(qr, { logo, logoModules }).toDataURL('image/png') : null),
    [qr, logo, logoModules],
  )

  useEffect(() => () => URL.revokeObjectURL(logo?.src ?? ''), [logo])

  async function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setLogoError(null)
    if (!file) return
    try {
      setLogo(await loadImage(file))
    } catch (error) {
      setLogo(null)
      setLogoError((error as Error).message)
    }
  }

  async function copyImage() {
    if (!qr) return
    try {
      const blob = await canvasToBlob(renderQr(qr, { logo, logoModules }))
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setStatus({ kind: 'ok', message: 'Copied to the clipboard.' })
    } catch {
      setStatus({
        kind: 'error',
        message: 'Your browser blocked clipboard access. Right-click the image and choose Copy Image instead.',
      })
    }
  }

  return (
    <main className="app">
      <header>
        <h1 className="title">
          {/* Same finder pattern as public/favicon.svg, inline so it follows the text colour. */}
          <svg className="logo" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
            <path fill="currentColor" fillRule="evenodd" d="M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2z" />
          </svg>
          Honest QR
        </h1>
        <p className="lede">
          QR codes with your logo in the middle, sized so scanners can still read them reliably.
          Always links directly to your URL with no intermediary.
        </p>
      </header>

      <div className="layout">
        <form className="controls" onSubmit={(event) => event.preventDefault()}>
          <label className="field">
            <span>URL or text</span>
            <input
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="https://example.com"
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span>Centre image</span>
            <input key={fileInputKey} type="file" accept="image/*" onChange={handleLogo} />
          </label>
          {logoError && (
            <p className="message error" role="alert">
              {logoError}
            </p>
          )}

          {logo && (
            <>
              <label className="field">
                <span>Image size: {logoPercent}% of the safe maximum</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={logoPercent}
                  onChange={(event) => setLogoPercent(Number(event.target.value))}
                />
              </label>
              <button type="button" className="link" onClick={() => {
                  setLogo(null)
                  setFileInputKey((key) => key + 1)
                }}>
                Remove image
              </button>
            </>
          )}

          <label className="field">
            <span>Minimum version</span>
            <select value={minVersion} onChange={(event) => setMinVersion(Number(event.target.value))}>
              <option value={1}>Automatic (smallest that fits)</option>
              {Array.from({ length: MAX_VERSION - 1 }, (_, i) => i + 2).map((version) => (
                <option key={version} value={version}>
                  Version {version} ({17 + version * 4}×{17 + version * 4})
                </option>
              ))}
            </select>
            <small>A larger version has more modules, so it leaves room for a bigger image.</small>
          </label>
        </form>

        <section className="preview" aria-live="polite">
          {result && 'error' in result && (
            <p className="message error" role="alert">
              Can't make a QR code: {result.error}
            </p>
          )}
          {!result && <p className="placeholder">Enter a URL to generate a QR code.</p>}
          {qr && imageUrl && (
            <>
              <img src={imageUrl} alt={`QR code for ${text}`} className="qr" />
              <div className="actions">
                <a className="button" href={imageUrl} download="qr-code.png">
                  Download PNG
                </a>
                <button type="button" className="button secondary" onClick={copyImage}>
                  Copy image
                </button>
              </div>
              {status.kind !== 'idle' && (
                <p className={`message ${status.kind}`} role="status">
                  {status.message}
                </p>
              )}
              <dl className="stats">
                <dt>Symbol</dt>
                <dd>
                  Version {qr.version}, {qr.size}×{qr.size} modules, error correction H
                </dd>
                <dt>Image area</dt>
                <dd>
                  {logoModules
                    ? `${logoModules}×${logoModules} modules (maximum ${maxModules}×${maxModules})`
                    : `None (up to ${maxModules}×${maxModules} modules available)`}
                </dd>
                {logoModules > 0 && (
                  <>
                    <dt>Redundancy used</dt>
                    <dd>
                      At most {worstDamage} of {correctablePerBlock(qr.version)} repairable codewords in
                      any block
                    </dd>
                  </>
                )}
              </dl>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

export default App
