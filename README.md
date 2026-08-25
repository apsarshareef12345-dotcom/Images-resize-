# AI Image Resizer & Consistency Tool

This is a working web app that uses AI to generate matching background areas for new image sizes. It restores the uploaded original image on top of the AI result so the central image stays unchanged.

## Start the tool

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Set your OpenAI API key as an environment variable named `OPENAI_API_KEY`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

For Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="your_api_key"
npm start
```

For macOS or Linux:

```bash
export OPENAI_API_KEY="your_api_key"
npm start
```
