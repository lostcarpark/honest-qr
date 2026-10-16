import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { canvasToBlob, renderQr } from './qr/render'

// jsdom has no canvas; the renderer has its own tests.
vi.mock('./qr/render', () => ({
  renderQr: vi.fn(() => ({ toDataURL: () => 'data:image/png;base64,QR' })),
  canvasToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}))

/** jsdom never loads images, so fire onload/onerror based on the file name. */
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 64
  naturalHeight = 64
  #src = ''
  get src() {
    return this.#src
  }
  set src(value: string) {
    this.#src = value
    queueMicrotask(() => (value.includes('broken') ? this.onerror?.() : this.onload?.()))
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal(
    'ClipboardItem',
    class {
      items: Record<string, Blob>
      constructor(items: Record<string, Blob>) {
        this.items = items
      }
    },
  )
  URL.createObjectURL = vi.fn((file: File) => `blob:${file.name}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function logoFile(name = 'logo.png') {
  return new File(['img'], name, { type: 'image/png' })
}

describe('App', () => {
  it('shows the title and promises a direct link', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Honest QR' })).toBeInTheDocument()
    expect(screen.getByText(/Always links directly to your URL with no intermediary\./)).toBeInTheDocument()
  })

  it('shows a QR code for the default URL', () => {
    render(<App />)
    const image = screen.getByRole('img', { name: 'QR code for https://example.com' })
    expect(image).toHaveAttribute('src', 'data:image/png;base64,QR')
    expect(screen.getByText(/error correction H/)).toBeInTheDocument()
  })

  it('offers the image as a PNG download', () => {
    render(<App />)
    const link = screen.getByRole('link', { name: 'Download PNG' })
    expect(link).toHaveAttribute('download', 'qr-code.png')
    expect(link).toHaveAttribute('href', 'data:image/png;base64,QR')
  })

  it('regenerates when the URL changes', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByLabelText('URL or text')
    await user.clear(input)
    await user.type(input, 'https://gitlab.com')
    expect(screen.getByRole('img', { name: 'QR code for https://gitlab.com' })).toBeInTheDocument()
  })

  it('asks for a URL when the field is empty', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.clear(screen.getByLabelText('URL or text'))
    expect(screen.getByText('Enter a URL to generate a QR code.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('reports text too long to encode', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByLabelText('URL or text')
    await user.click(input)
    await user.paste('x'.repeat(1300))
    expect(screen.getByRole('alert')).toHaveTextContent(/Can't make a QR code/)
  })

  it('uses a bigger symbol when a minimum version is chosen', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText(/Minimum version/), '10')
    expect(screen.getByText(/Version 10, 57×57 modules/)).toBeInTheDocument()
  })

  it('places an uploaded image at the safe maximum size by default', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText(/None \(up to 5×5 modules available\)/)).toBeInTheDocument()

    await user.upload(screen.getByLabelText('Centre image'), logoFile())
    expect(await screen.findByText('5×5 modules (maximum 5×5)')).toBeInTheDocument()
    expect(screen.getByText(/repairable codewords in any block/)).toBeInTheDocument()
    expect(vi.mocked(renderQr)).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: 3 }),
      expect.objectContaining({ logoModules: 5, logo: expect.any(FakeImage) }),
    )
  })

  it('lets the image be made smaller', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText(/Minimum version/), '10')
    await user.upload(screen.getByLabelText('Centre image'), logoFile())
    const slider = await screen.findByRole('slider')
    // jsdom can't drag range inputs, so set the value directly.
    fireEvent.change(slider, { target: { value: '50' } })
    expect(screen.getByText(/Image size: 50%/)).toBeInTheDocument()
    expect(screen.getByText('7×7 modules (maximum 17×17)')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '10' } })
    expect(screen.getByText(/None \(up to 17×17 modules available\)/)).toBeInTheDocument()
  })

  it('removes the image', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Centre image'), logoFile())
    await user.click(await screen.findByRole('button', { name: 'Remove image' }))
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.getByText(/None \(up to 5×5 modules available\)/)).toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo.png')
  })

  it('reports files that are not images', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText('Centre image'), logoFile('broken.png'))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be read as an image')
  })

  it('copies the image to the clipboard', async () => {
    const user = userEvent.setup()
    const write = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Copy image' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Copied to the clipboard.')
    expect(vi.mocked(canvasToBlob)).toHaveBeenCalled()
    expect(write).toHaveBeenCalledWith([expect.objectContaining({ items: { 'image/png': expect.any(Blob) } })])
  })

  it('falls back to right-click instructions when the clipboard is blocked', async () => {
    const user = userEvent.setup()
    const write = vi.fn(async () => {
      throw new Error('denied')
    })
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Copy image' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Right-click the image/)
  })
})
