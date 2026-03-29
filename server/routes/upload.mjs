import { Router } from 'express';
import multer from 'multer';
import { readFileSync } from 'fs';
import { extname } from 'path';
import { addDocument } from '../db.mjs';

const router = Router();

// Store uploads with original extension preserved
const storage = multer.diskStorage({
  destination: '/tmp/bestie-uploads/',
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.pptx', '.xlsx',
  '.odt', '.odp', '.ods',
  '.rtf', '.txt', '.md', '.html', '.htm', '.csv',
]);

// POST /api/upload
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = extname(req.file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        error: `Unsupported file type: ${ext}. Supported: ${[...SUPPORTED_EXTENSIONS].join(', ')}`,
      });
    }

    const sessionId = req.body.sessionId || null;
    const filePath = req.file.path;

    console.log(`[Upload] File: ${req.file.originalname} (${ext}, ${req.file.size} bytes)`);

    let contentText;

    // Plain text formats — read directly
    if (['.txt', '.md', '.csv'].includes(ext)) {
      contentText = readFileSync(filePath, 'utf-8');
    }
    // HTML — strip tags, keep text
    else if (['.html', '.htm'].includes(ext)) {
      const raw = readFileSync(filePath, 'utf-8');
      contentText = stripHtml(raw);
    }
    // Office/PDF formats — use officeparser
    else {
      const { parseOffice } = await import('officeparser');
      const result = await parseOffice(filePath);
      contentText = result.toText();
    }

    if (!contentText || contentText.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract text from file' });
    }

    // Generate doc ID
    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Save to database
    addDocument(docId, sessionId, req.file.originalname, ext.slice(1), contentText);

    console.log(`[Upload] Parsed ${contentText.length} chars, saved as ${docId}`);

    res.json({
      docId,
      filename: req.file.originalname,
      fileType: ext.slice(1),
      contentLength: contentText.length,
      // Send first 5000 chars as preview (full content in DB)
      preview: contentText.slice(0, 5000),
      contentText: contentText.slice(0, 50000), // Cap at 50K chars for LLM
    });
  } catch (err) {
    console.error('[Upload] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function stripHtml(html) {
  // Remove script and style tags with content
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Replace br and p tags with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export default router;
