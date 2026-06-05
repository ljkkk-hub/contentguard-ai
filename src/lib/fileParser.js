/**
 * 文件解析器 — 支持 PDF / Word / TXT
 */
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// PDF worker 配置
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * 解析上传文件为纯文本
 * @param {File} file
 * @returns {Promise<{ text: string, pageCount?: number }>}
 */
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  switch (ext) {
    case 'pdf':
      return parsePDF(file);
    case 'docx':
    case 'doc':
      return parseWord(file);
    case 'txt':
    case 'md':
    case 'csv':
      return parseText(file);
    default:
      throw new Error(`不支持的文件格式: .${ext}`);
  }
}

async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  const pageCount = pdf.numPages;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    text += pageText + '\n';
  }

  return { text: text.trim(), pageCount };
}

async function parseWord(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return { text: result.value.trim() };
}

async function parseText(file) {
  const text = await file.text();
  return { text: text.trim() };
}
