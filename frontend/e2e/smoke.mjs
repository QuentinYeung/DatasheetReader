import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright-core'

function createTextPdf() {
  const firstPage = 'BT /F1 18 Tf 72 720 Td (MOSFET gate voltage is 10 V.) Tj ET'
  const secondPage = 'BT /F1 18 Tf 72 720 Td (Second page: maximum drain current is 20 A.) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(firstPage)} >>\nstream\n${firstPage}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    `<< /Length ${Buffer.byteLength(secondPage)} >>\nstream\n${secondPage}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf)
}

const baseUrl = process.env.DATASHEET_READER_URL || 'http://127.0.0.1:5173'
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium'
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'datasheet-reader-e2e-'))
const pdfPath = join(temporaryDirectory, 'smoke-datasheet.pdf')
await writeFile(pdfPath, createTextPdf())

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox'],
})

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`))
  page.on('pageerror', (error) => console.error(`[browser:error] ${error.message}`))
  await page.goto(baseUrl)
  await page.getByLabel('选择 PDF 文件').setInputFiles(pdfPath)
  await page.locator('.reader-status').filter({ hasText: '已导入：smoke-datasheet.pdf' }).waitFor()
  await page.locator('.react-pdf__Page__canvas').waitFor()
  await page.getByLabel('总页数').filter({ hasText: '/ 2' }).waitFor()

  const canvas = page.locator('.react-pdf__Page__canvas')
  const beforeZoom = await canvas.boundingBox()
  await page.getByRole('button', { name: '放大' }).click()
  await page.getByText('120%').waitFor()
  await page.waitForFunction(
    (previousWidth) => document.querySelector('.react-pdf__Page__canvas')?.width > previousWidth,
    beforeZoom.width,
  )

  const selectableText = page.locator('.textLayer span').first()
  await selectableText.waitFor()
  await selectableText.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    element.closest('.pdf-page').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.locator('.selected-copy').filter({ hasText: 'MOSFET gate voltage is 10 V.' }).waitFor()

  await page.getByRole('button', { name: '下一页' }).click()
  await page.locator('.textLayer').filter({ hasText: 'Second page: maximum drain current is 20 A.' }).waitFor()
  if (await page.getByLabel('当前页码').inputValue() !== '2') {
    throw new Error('Page navigation did not advance to page 2.')
  }

  console.log('E2E smoke test passed: import, render, page navigation, zoom and text selection work.')
} catch (error) {
  console.error(error)
  throw error
} finally {
  await browser.close()
}
