import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

const TEXT_EXTENSIONS = ['.txt', '.csv', '.md', '.json'];
const extOf = (name) => name.slice(name.lastIndexOf('.')).toLowerCase();

export const isSupported = (filename) => ['.pdf', '.docx', ...TEXT_EXTENSIONS].includes(extOf(filename));

// Returns the readable text of an uploaded file, or throws for unsupported types.
export async function extractText(filename, buffer) {
  const ext = extOf(filename);
  if (ext === '.pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      return (await parser.getText()).text.trim();
    } finally {
      await parser.destroy();
    }
  }
  if (ext === '.docx') {
    return (await mammoth.extractRawText({ buffer })).value.trim();
  }
  if (TEXT_EXTENSIONS.includes(ext)) {
    return buffer.toString('utf8').trim();
  }
  throw new Error(`Unsupported file type: ${ext || filename}`);
}
