import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// The browser performs the resize: images never leave the user's device.
app.use(express.static(path.join(__dirname, 'public')));

app.listen(process.env.PORT || 3000, () => console.log('Image Resizer is ready'));
