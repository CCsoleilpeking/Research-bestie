import { execFile } from 'child_process';
import { readFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, rmSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { createWriteStream } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIGURES_DIR = join(__dirname, '..', '..', 'data', 'figures');

// Ensure figures directory exists
mkdirSync(FIGURES_DIR, { recursive: true });

/**
 * Download a file from URL to local path
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = createWriteStream(destPath);

    proto.get(url, (response) => {
      // Handle redirects — close the unused file handle before recursing
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(destPath); });
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

/**
 * Download PDF from arxiv URL
 * Converts arxiv abs URL to PDF URL
 */
export async function downloadArxivPdf(url) {
  // Convert various arxiv URLs to PDF download URL
  let pdfUrl = url;
  if (url.includes('arxiv.org/abs/')) {
    pdfUrl = url.replace('/abs/', '/pdf/') + '.pdf';
  } else if (url.includes('arxiv.org/html/')) {
    const id = url.match(/arxiv\.org\/html\/(.+?)(?:v\d+)?$/)?.[1];
    if (id) pdfUrl = `https://arxiv.org/pdf/${id}.pdf`;
  }
  // If not arxiv, try direct download
  if (!pdfUrl.endsWith('.pdf')) pdfUrl = url;

  const filename = `arxiv_${Date.now()}.pdf`;
  const destPath = join('/tmp', filename);

  console.log(`[MinerU] Downloading PDF: ${pdfUrl}`);
  await downloadFile(pdfUrl, destPath);
  console.log(`[MinerU] Downloaded to: ${destPath}`);
  return destPath;
}

/**
 * Parse PDF with MinerU CLI
 * Returns { markdown, figures: [{ id, filename, path, caption }] }
 */
export function parsePdfWithMinerU(pdfPath) {
  return new Promise((resolve, reject) => {
    const outputDir = join('/tmp', `mineru_${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    console.log(`[MinerU] Parsing: ${pdfPath} → ${outputDir}`);

    execFile('mineru', ['-p', pdfPath, '-o', outputDir, '-b', 'pipeline'], {
      timeout: 300000, // 5 min timeout
    }, (error, stdout, stderr) => {
      if (error) {
        cleanupTempFiles(pdfPath, outputDir);
        console.error(`[MinerU] Parse error:`, error.message);
        reject(error);
        return;
      }

      try {
        // Find the output markdown and images
        const pdfName = basename(pdfPath, '.pdf');
        const autoDir = join(outputDir, pdfName, 'auto');

        if (!existsSync(autoDir)) {
          // Try finding any subdirectory
          const subdirs = readdirSync(outputDir);
          if (subdirs.length > 0) {
            const altAutoDir = join(outputDir, subdirs[0], 'auto');
            if (existsSync(altAutoDir)) {
              const result = processOutput(altAutoDir);
              cleanupTempFiles(pdfPath, outputDir);
              resolve(result);
              return;
            }
          }
          cleanupTempFiles(pdfPath, outputDir);
          reject(new Error('MinerU output directory not found'));
          return;
        }

        const result = processOutput(autoDir);
        cleanupTempFiles(pdfPath, outputDir);
        resolve(result);
      } catch (err) {
        cleanupTempFiles(pdfPath, outputDir);
        reject(err);
      }
    });
  });
}

function cleanupTempFiles(pdfPath, outputDir) {
  try { unlinkSync(pdfPath); } catch { /* already gone */ }
  try { rmSync(outputDir, { recursive: true, force: true }); } catch { /* already gone */ }
}

function processOutput(autoDir) {
  // Find markdown file
  const files = readdirSync(autoDir);
  const mdFile = files.find(f => f.endsWith('.md'));
  const markdown = mdFile ? readFileSync(join(autoDir, mdFile), 'utf-8') : '';

  // Find and copy images to figures directory
  const imagesDir = join(autoDir, 'images');
  const figures = [];

  if (existsSync(imagesDir)) {
    const imageFiles = readdirSync(imagesDir).filter(f =>
      /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(f)
    );

    for (const imgFile of imageFiles) {
      const figureId = `fig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const destFilename = `${figureId}_${imgFile}`;
      const srcPath = join(imagesDir, imgFile);
      const destPath = join(FIGURES_DIR, destFilename);

      copyFileSync(srcPath, destPath);

      // Try to find caption from markdown
      const captionMatch = markdown.match(new RegExp(`!\\[.*?\\]\\(images/${imgFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*\\n(.+?)\\n`, 'i'));
      const caption = captionMatch?.[1]?.trim() || '';

      figures.push({
        id: figureId,
        filename: destFilename,
        originalName: imgFile,
        caption,
        url: `/api/figures/${destFilename}`,
      });
    }
  }

  console.log(`[MinerU] Parsed: ${markdown.length} chars, ${figures.length} figures`);
  return { markdown, figures };
}

/**
 * Get all figure URLs for a session's most recent parse
 */
export function getFiguresForSession(sessionId) {
  // For now just return all figures — can be improved with DB tracking
  if (!existsSync(FIGURES_DIR)) return [];
  return readdirSync(FIGURES_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(f))
    .map(f => ({
      filename: f,
      url: `/api/figures/${f}`,
    }));
}
