import { useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MIN_SCALE = 0.6
const MAX_SCALE = 2.4

function App() {
  const [documentInfo, setDocumentInfo] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [scale, setScale] = useState(1)
  const [selectedText, setSelectedText] = useState('')
  const [statusText, setStatusText] = useState('请选择一份带文字层的 PDF 数据手册。')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const pageContainerRef = useRef(null)

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('请选择扩展名为 .pdf 的文件。')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('PDF 不能超过 50 MB。')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    setStatusText('正在导入 PDF…')

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.detail || '导入失败，请检查后端是否已经启动。')
      }

      setDocumentInfo(body)
      setPageNumber(1)
      setPageCount(0)
      setScale(1)
      setSelectedText('')
      setStatusText(`已导入：${body.filename}`)
    } catch (uploadError) {
      setError(uploadError.message || '导入失败。')
      setStatusText('请选择 PDF 后重试。')
    } finally {
      setUploading(false)
    }
  }

  function handleDocumentLoad({ numPages }) {
    setPageCount(numPages)
    setPageNumber((current) => Math.min(Math.max(current, 1), numPages))
  }

  function handleSelection() {
    const selection = window.getSelection()
    const container = pageContainerRef.current
    if (
      !selection ||
      selection.isCollapsed ||
      !container ||
      !container.contains(selection.anchorNode) ||
      !container.contains(selection.focusNode)
    ) {
      return
    }

    const text = selection.toString().replace(/\s+/g, ' ').trim()
    if (text) setSelectedText(text)
  }

  function changePage(nextPage) {
    const safePage = Math.min(Math.max(nextPage, 1), pageCount || 1)
    setPageNumber(safePage)
    setSelectedText('')
  }

  function changeScale(delta) {
    setScale((current) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current + delta))
      return Math.round(next * 10) / 10
    })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">本地数据手册阅读工具</p>
          <h1>Datasheet Reader</h1>
        </div>
        <label className={`import-button ${uploading ? 'is-disabled' : ''}`}>
          <input
            aria-label="选择 PDF 文件"
            type="file"
            accept="application/pdf,.pdf"
            disabled={uploading}
            onChange={handleFileChange}
          />
          {uploading ? '正在导入…' : '打开 PDF'}
        </label>
      </header>

      <main className="workspace">
        <section className="reader-panel" aria-label="PDF 阅读区">
          <div className="toolbar">
            <div className="page-controls">
              <button
                type="button"
                disabled={!documentInfo || pageNumber <= 1}
                onClick={() => changePage(pageNumber - 1)}
              >
                上一页
              </button>
              <label>
                <span className="sr-only">当前页码</span>
                <input
                  className="page-input"
                  type="number"
                  min="1"
                  max={pageCount || 1}
                  value={pageNumber}
                  disabled={!documentInfo}
                  onChange={(event) => changePage(Number(event.target.value) || 1)}
                />
              </label>
              <span aria-label="总页数">/ {pageCount || '—'}</span>
              <button
                type="button"
                disabled={!documentInfo || pageNumber >= pageCount}
                onClick={() => changePage(pageNumber + 1)}
              >
                下一页
              </button>
            </div>

            <div className="zoom-controls">
              <button
                type="button"
                aria-label="缩小"
                disabled={!documentInfo || scale <= MIN_SCALE}
                onClick={() => changeScale(-0.2)}
              >
                −
              </button>
              <span>{Math.round(scale * 100)}%</span>
              <button
                type="button"
                aria-label="放大"
                disabled={!documentInfo || scale >= MAX_SCALE}
                onClick={() => changeScale(0.2)}
              >
                ＋
              </button>
            </div>
          </div>

          <div className="reader-status" role="status">
            {statusText}
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}

          <div className="document-stage">
            {documentInfo ? (
              <Document
                file={documentInfo.file_url}
                loading={<div className="empty-state">正在读取 PDF…</div>}
                error={<div className="error-message">PDF 显示失败，请重新导入。</div>}
                onLoadSuccess={handleDocumentLoad}
              >
                <div
                  className="pdf-page"
                  ref={pageContainerRef}
                  onMouseUp={handleSelection}
                >
                  <Page
                    pageNumber={pageNumber}
                    width={760}
                    scale={scale}
                    renderAnnotationLayer
                    renderTextLayer
                  />
                </div>
              </Document>
            ) : (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true">PDF</div>
                <h2>打开一份芯片数据手册</h2>
                <p>文件只会复制到本机应用数据目录，原始 PDF 不会被修改。</p>
              </div>
            )}
          </div>
        </section>

        <aside className="translation-panel" aria-label="翻译面板">
          <div className="panel-heading">
            <p className="eyebrow">阶段 1</p>
            <h2>翻译面板</h2>
          </div>

          <section className="selection-card">
            <div className="selection-title">
              <h3>选中的原文</h3>
              {selectedText && <span>PDF 第 {pageNumber} 页</span>}
            </div>
            {selectedText ? (
              <p className="selected-copy">{selectedText}</p>
            ) : (
              <p className="placeholder-copy">
                在左侧 PDF 中拖动鼠标选择英文，原文会显示在这里。
              </p>
            )}
          </section>

          <section className="future-card" aria-disabled="true">
            <h3>中文翻译</h3>
            <p>AI 翻译将在下一阶段接入。本阶段不会上传任何文字到 AI 服务。</p>
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App
