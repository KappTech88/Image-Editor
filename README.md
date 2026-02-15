# Text to Image Generator

A simple web application for generating images from text prompts using the ModelsLab API.

## Features

- 🎨 Multiple AI models support (Flux, Stable Diffusion, Midjourney, etc.)
- ⚙️ Customizable generation settings (dimensions, steps, guidance scale)
- 🔄 Automatic polling for async image generation
- 🛡️ Security features (rate limiting, input validation, security headers)
- 📱 Responsive design with dark theme

## Security Improvements

This application includes several security enhancements:

- **Rate Limiting**: Protects against abuse (100 requests per 15 minutes per IP)
- **Input Validation**: Server-side validation using express-validator
- **Security Headers**: Helmet middleware for secure HTTP headers
- **Request Timeouts**: 30-second timeout for API requests
- **Content Security Policy**: Prevents XSS attacks
- **Error Handling**: Sanitized error messages to avoid information leakage

## Prerequisites

- Node.js 18+ (LTS version recommended)
- ModelsLab API key ([Get one here](https://modelslab.com))

## Installation

1. Clone the repository:
```bash
git clone https://github.com/KappTech88/Image-Editor.git
cd Image-Editor
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Create a `.env` file for custom configuration:
```bash
cp .env.example .env
```

4. Start the server:
```bash
npm start
```

5. Open your browser and navigate to `http://localhost:3001`

## Usage

1. Enter your ModelsLab API key in the settings panel
2. Select your preferred model and adjust generation settings
3. Enter a prompt describing the image you want to generate
4. (Optional) Add a negative prompt to exclude certain elements
5. Click "Generate Image" or press Ctrl+Enter (Cmd+Enter on Mac)
6. Wait for the image to be generated
7. Download or open the generated images

## API Endpoints

### POST /api/generate
Generates images from text prompts.

**Request Body:**
```json
{
  "apiKey": "your-api-key",
  "prompt": "a beautiful sunset",
  "negativePrompt": "blurry, low quality",
  "model": "flux",
  "width": "512",
  "height": "512",
  "samples": "1",
  "steps": "30",
  "guidanceScale": 7.5,
  "enhancePrompt": false
}
```

### POST /api/fetch
Polls for image generation results.

**Request Body:**
```json
{
  "apiKey": "your-api-key",
  "id": "generation-id"
}
```

### GET /health
Health check endpoint.

## Configuration

Environment variables (optional):
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment mode (development/production)

## Development

```bash
npm run dev
```

## License

MIT

## Credits

Powered by [ModelsLab API](https://modelslab.com)
