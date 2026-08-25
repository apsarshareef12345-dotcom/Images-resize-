import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
import fs from "fs";

const uploadDir = "/tmp/uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
await mkdir(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));

const apiSize = (width, height) => {
  const ratio = width / height;
  if (ratio > 1.2) return { width: 1536, height: 1024, name: '1536x1024' };
  if (ratio < 0.83) return { width: 1024, height: 1536, name: '1024x1536' };
  return { width: 1024, height: 1024, name: '1024x1024' };
};

app.post('/api/expand', upload.single('image'), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Add OPENAI_API_KEY before starting the tool.' });
  if (!req.file) return res.status(400).json({ error: 'Upload an image first.' });
  const width = Number(req.body.width), height = Number(req.body.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 100 || height < 100) return res.status(400).json({ error: 'Enter a valid width and height.' });

  try {
    const original = await readFile(req.file.path);
    const meta = await sharp(original).metadata();
    const originalW = meta.width, originalH = meta.height;
    const ai = apiSize(width, height);
    const fitScale = Math.min(ai.width / originalW, ai.height / originalH, 1);
    const seedW = Math.round(originalW * fitScale), seedH = Math.round(originalH * fitScale);
    const seed = await sharp({ create: { width: ai.width, height: ai.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp(original).resize(seedW, seedH).png().toBuffer(), left: Math.round((ai.width - seedW) / 2), top: Math.round((ai.height - seedH) / 2) }])
      .png().toBuffer();

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', 'Expand only the transparent canvas around the supplied original image. Create a seamless continuation of its real background. Do not change, redraw, crop, blur, stretch, duplicate, or add anything over the original central image. Preserve all original subjects, faces, products, text, logos, colors, lighting, and sharpness.');
    form.append('size', ai.name);
    form.append('image', new Blob([seed], { type: 'image/png' }), 'expand-seed.png');
    const response = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || 'Image generation failed.');
    const generated = Buffer.from(body.data[0].b64_json, 'base64');

    // Restore the source image on top, so the original stays pixel-perfect.
    const finalScale = Math.min(width / originalW, height / originalH, 1);
    const finalW = Math.round(originalW * finalScale), finalH = Math.round(originalH * finalScale);
    const final = await sharp(generated).resize(width, height, { fit: 'cover', position: 'centre' })
      .composite([{ input: await sharp(original).resize(finalW, finalH).png().toBuffer(), left: Math.round((width - finalW) / 2), top: Math.round((height - finalH) / 2) }])
      .png().toBuffer();
    res.type('png').send(final);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not expand the image.' });
  } finally {
    await rm(req.file.path, { force: true });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Open http://localhost:3000'));
