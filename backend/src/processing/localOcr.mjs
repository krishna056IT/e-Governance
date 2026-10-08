import { createRequire } from 'node:module'
import { createCanvas } from '@napi-rs/canvas'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createWorker } from 'tesseract.js'
import { env } from '../config/env.mjs'

const require = createRequire(import.meta.url)
const { langPath } = require('@tesseract.js-data/eng')
let workerPromise

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { langPath, gzip: true })
      .catch((error) => {
        workerPromise = undefined
        throw error
      })
  }
  return workerPromise
}

async function recognizePage(worker, image) {
  const result = await worker.recognize(image)
  return {
    text: result.data.text,
    confidence: result.data.confidence,
  }
}

async function recognizePdf(buffer, worker) {
  const document = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise

  try {
    if (document.numPages > env.MAX_PDF_PAGES) {
      throw new Error(`PDF exceeds the ${env.MAX_PDF_PAGES}-page OCR limit.`)
    }

    const pages = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const unscaledViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(
        1.5,
        4000 / Math.max(unscaledViewport.width, unscaledViewport.height),
        Math.sqrt(12_000_000 / (unscaledViewport.width * unscaledViewport.height)),
      )
      const viewport = page.getViewport({ scale })
      const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)))
      const context = canvas.getContext('2d')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      pages.push(await recognizePage(worker, canvas.toBuffer('image/png')))
      page.cleanup()
    }
    return pages
  } finally {
    await document.destroy()
  }
}

export async function recognizeDocument({ buffer, mimeType }) {
  const worker = await getWorker()
  let pages
  if (mimeType === 'application/pdf') {
    pages = await recognizePdf(buffer, worker)
  } else {
    pages = [await recognizePage(worker, buffer)]
  }

  const text = pages.map((page) => page.text.trim()).filter(Boolean).join('\n\n')
  const totalWeight = pages.reduce((sum, page) => sum + Math.max(page.text.trim().length, 1), 0)
  const confidence = Math.round(
    pages.reduce((sum, page) => sum + page.confidence * Math.max(page.text.trim().length, 1), 0) /
      totalWeight,
  )

  return { text, confidence }
}

export async function terminateOcrWorker() {
  if (workerPromise) {
    const worker = await workerPromise
    await worker.terminate()
    workerPromise = undefined
  }
}
