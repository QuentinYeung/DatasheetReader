import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import App from './App.jsx'

vi.mock('react-pdf', async () => {
  const React = await vi.importActual('react')
  return {
    pdfjs: { GlobalWorkerOptions: {} },
    Document: ({ children, onLoadSuccess }) => {
      React.useEffect(() => onLoadSuccess({ numPages: 3 }), [onLoadSuccess])
      return <div data-testid="pdf-document">{children}</div>
    },
    Page: ({ pageNumber }) => (
      <div data-testid="pdf-page">Selectable datasheet sentence. Page {pageNumber}</div>
    ),
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Datasheet Reader', () => {
  test('shows the two-column reader shell before a file is opened', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Datasheet Reader' })).toBeTruthy()
    expect(screen.getByLabelText('PDF 阅读区')).toBeTruthy()
    expect(screen.getByLabelText('翻译面板')).toBeTruthy()
    expect(screen.getByText(/不会上传任何文字到 AI/)).toBeTruthy()
  })

  test('imports a PDF and supports page and zoom controls', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document_id: 'a'.repeat(64),
        filename: 'motor-controller.pdf',
        page_count: 3,
        file_url: `/api/documents/${'a'.repeat(64)}/file`,
      }),
    }))

    render(<App />)
    const file = new File(['%PDF-test'], 'motor-controller.pdf', {
      type: 'application/pdf',
    })
    await user.upload(screen.getByLabelText('选择 PDF 文件'), file)

    expect(await screen.findByText('已导入：motor-controller.pdf')).toBeTruthy()
    expect(screen.getByLabelText('总页数').textContent).toContain('3')

    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByDisplayValue('2')).toBeTruthy()
    expect(screen.getByTestId('pdf-page').textContent).toContain('Page 2')

    await user.click(screen.getByRole('button', { name: '放大' }))
    expect(screen.getByText('120%')).toBeTruthy()
  })

  test('copies selected PDF text into the reserved translation panel', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document_id: 'b'.repeat(64),
        filename: 'buck.pdf',
        page_count: 3,
        file_url: `/api/documents/${'b'.repeat(64)}/file`,
      }),
    }))

    render(<App />)
    await user.upload(
      screen.getByLabelText('选择 PDF 文件'),
      new File(['%PDF-test'], 'buck.pdf', { type: 'application/pdf' }),
    )

    const textNode = await screen.findByTestId('pdf-page')
    const range = document.createRange()
    range.selectNodeContents(textNode)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    fireEvent.mouseUp(textNode.closest('.pdf-page'))

    await waitFor(() => {
      expect(document.querySelector('.selected-copy')?.textContent).toContain(
        'Selectable datasheet sentence',
      )
      expect(screen.getByText('PDF 第 1 页')).toBeTruthy()
    })
  })
})
