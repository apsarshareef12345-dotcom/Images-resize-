import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = '/tmp/image-resizer-uploads';
await mkdir(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } });
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const apiCanvasSize = (width, height) => {
  const ratio = width / height;
  if (ratio > 1.2) return { width: 1536, height: 1024, name: '1536x1024' };
  if (ratio < 0.83) return { width: 1024, height: 1536, name: '1024x1536' };
  return { width: 1024, height: 1024, name: '1024x1024' };
};

app.post('/api/expand', upload.single('image'), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Add OPENAI_API_KEY in Vercel Environment Variables, then redeploy.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Upload an image first.' });
    const width = Number(req.body.width);
    const height = Number(req.body.height);
    const instruction = String(req.body.instruction || '').trim().slice(0, 500);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 100 || height < 100 || width > 10000 || height > 10000) {
    return res.status(400).json({ error: 'Enter a width and height between 100 and 10,000 pixels.' });
  }

  try {
    const original = await readFile(req.file.path);
    const metadata = await sharp(original).metadata();
    if (!metadata.width || !metadata.height) throw new Error('This image could not be read.');

    const ai = apiCanvasSize(width, height);
    const seedScale = Math.min(ai.width / metadata.width, ai.height / metadata.height, 1);
    const seedWidth = Math.round(metadata.width * seedScale);
    const seedHeight = Math.round(metadata.height * seedScale);
    const seed = await sharp({
      create: { width: ai.width, height: ai.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite([{
      input: await sharp(original).resize(seedWidth, seedHeight, { fit: 'inside' }).png().toBuffer(),
      left: Math.round((ai.width - seedWidth) / 2),
      top: Math.round((ai.height - seedHeight) / 2)
    }]).png().toBuffer();

    const form = new FormData();
    form.append('model', 'gpt-image-1.5');
    form.append('image[]', new Blob([seed], { type: 'image/png' }), 'image-to-expand.png');
    form.append('prompt', `Extend only the transparent area around the supplied image with a seamless, realistic continuation of the existing scene. Do not change, redraw, crop, blur, stretch, duplicate, or add anything over the visible original image. Preserve its people, products, text, logos, colors, lighting, and sharpness exactly.${instruction ? ` Additional direction: ${instruction}` : ''}`);
    form.append('size', ai.name);
    form.append('quality', 'high');
    form.append('input_fidelity', 'high');
    form.append('output_format', 'png');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || 'AI background generation failed.');
    const generated = Buffer.from(body.data?.[0]?.b64_json || '', 'base64');
    if (!generated.length) throw new Error('The AI service did not return an image.');

    // The original is placed back over the AI image so its visible pixels stay unchanged.
    const finalScale = Math.min(width / metadata.width, height / metadata.height, 1);
    const finalWidth = Math.round(metadata.width * finalScale);
    const finalHeight = Math.round(metadata.height * finalScale);
    const final = await sharp(generated)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .composite([{
        input: await sharp(original).resize(finalWidth, finalHeight, { fit: 'inside' }).png().toBuffer(),
        left: Math.round((width - finalWidth) / 2),
        top: Math.round((height - finalHeight) / 2)
      }])
      .png()
      .toBuffer();
    res.type('png').send(final);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not create the matching background.' });
  } finally {
    await rm(req.file.path, { force: true });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('AI Image Resizer is ready'));
