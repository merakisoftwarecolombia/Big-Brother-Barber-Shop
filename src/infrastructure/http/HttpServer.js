import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

/**
 * HTTP Server - Infrastructure Layer
 * Minimal HTTP server for WhatsApp webhooks
 */
export class HttpServer {
  #server;
  #webhookHandler;
  #verifyToken;
  #port;

  constructor({ webhookHandler, verifyToken, port = 3000 }) {
    this.#webhookHandler = webhookHandler;
    this.#verifyToken = verifyToken;
    this.#port = port;
  }

  start() {
    this.#server = createServer(async (req, res) => {
      try {
        await this.#handleRequest(req, res);
      } catch (error) {
        console.error('Request error:', error.message);
        this.#sendResponse(res, 500, { error: 'Internal server error' });
      }
    });

    this.#server.listen(this.#port, () => {
      console.log(`Server running on port ${this.#port}`);
    });

    return this.#server;
  }

  async #handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.#port}`);
    
    // Health check endpoint
    if (url.pathname === '/health' && req.method === 'GET') {
      return this.#sendResponse(res, 200, { status: 'healthy', timestamp: new Date().toISOString() });
    }

    // Serve static images (support both /images/ and /Imagenes/)
    if ((url.pathname.startsWith('/images/') || url.pathname.startsWith('/Imagenes/')) && req.method === 'GET') {
      return this.#serveImage(url.pathname, res);
    }

    // Webhook verification (GET)
    if (url.pathname === '/webhook' && req.method === 'GET') {
      return this.#handleVerification(url, res);
    }

    // Webhook messages (POST)
    if (url.pathname === '/webhook' && req.method === 'POST') {
      return this.#handleWebhook(req, res);
    }

    this.#sendResponse(res, 404, { error: 'Not found' });
  }

  #serveImage(pathname, res) {
    const imageName = pathname.replace('/images/', '').replace('/Imagenes/', '');
    const imagePath = join(process.cwd(), 'Imagenes', imageName);
    
    if (!existsSync(imagePath)) {
      return this.#sendResponse(res, 404, { error: 'Image not found' });
    }

    const ext = extname(imageName).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    try {
      const imageData = readFileSync(imagePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': imageData.length,
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(imageData);
    } catch (error) {
      console.error('Error serving image:', error.message);
      this.#sendResponse(res, 500, { error: 'Failed to serve image' });
    }
  }

  #handleVerification(url, res) {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === this.#verifyToken) {
      console.log('Webhook verified');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
      return;
    }

    this.#sendResponse(res, 403, { error: 'Verification failed' });
  }

  async #handleWebhook(req, res) {
    const body = await this.#parseBody(req);
    
    // Respond immediately to avoid timeout
    this.#sendResponse(res, 200, { status: 'received' });

    // Process messages asynchronously
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const messages = changes?.value?.messages;

    if (messages && messages.length > 0) {
      for (const message of messages) {
        if (message.type === 'text') {
          await this.#webhookHandler.handleMessage(message);
        }
      }
    }
  }

  #parseBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  #sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  stop() {
    if (this.#server) {
      this.#server.close();
    }
  }
}