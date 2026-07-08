const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 80;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.xml': 'application/xml',
  '.txt': 'text/plain'
};

// Cache en memoria para componentes

/**
 * Carga un componente desde la carpeta components/
 */
async function loadComponent(componentName) {
  const componentPath = path.join(__dirname, 'components', `${componentName}.html`);
  
  try {
    const content = await fs.promises.readFile(componentPath, 'utf8');
    return content;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error cargando componente ${componentName}:`, err.message);
    }
    return '';
  }
}

/**
 * Procesa los includes en el HTML: <!--#include file="header.html" -->
 */
async function processIncludes(htmlContent) {
  const includeRegex = /<!--#include\s+file="([^"]+)"\s*-->/g;
  let result = htmlContent;
  let match;
  
  while ((match = includeRegex.exec(htmlContent)) !== null) {
    const componentName = match[1].replace('.html', '');
    const componentContent = await loadComponent(componentName);
    result = result.replace(match[0], componentContent);
  }
  
  return result;
}

/**
 * Determina el tipo de compresión a usar
 */
function getEncoding(acceptEncoding) {
  if (!acceptEncoding) return null;
  
  if (acceptEncoding.includes('br')) {
    return { type: 'br', encoder: zlib.createBrotliCompress() };
  }
  
  if (acceptEncoding.includes('gzip')) {
    return { type: 'gzip', encoder: zlib.createGzip() };
  }
  
  return null;
}

/**
 * Obtiene headers de cache basados en el tipo de archivo
 */
function getCacheHeaders(ext, mtime) {
  const isImage = ['.webp', '.png', '.jpg', '.jpeg', '.svg', '.ico'].includes(ext);
  const isFont = ['.woff', '.woff2', '.ttf', '.eot'].includes(ext);
  const isStatic = ['.css', '.js'].includes(ext);

  const headers = {
    'Last-Modified': mtime ? new Date(mtime).toUTCString() : undefined
  };

  if (isImage || isFont) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    headers['Expires'] = new Date(Date.now() + 31536000000).toUTCString();
  } else if (isStatic) {
    headers['Cache-Control'] = 'public, max-age=604800';
    headers['Expires'] = new Date(Date.now() + 604800000).toUTCString();
  } else {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  }

  return headers;
}

/**
 * Sirve una página de error personalizada
 */
async function serveError(res, code, acceptEncoding) {
  try {
    const content = await fs.promises.readFile(path.join(__dirname, `${code}.html`));
    const encoding = getEncoding(acceptEncoding);
    if (encoding) {
      res.writeHead(code, { 
        'Content-Type': 'text/html',
        'Content-Encoding': encoding.type,
        ...getCacheHeaders('.html', Date.now())
      });
      const compressor = encoding.type === 'br' ? zlib.createBrotliCompress() : zlib.createGzip();
      compressor.pipe(res);
      compressor.end(content);
    } else {
      res.writeHead(code, { 'Content-Type': 'text/html', ...getCacheHeaders('.html', Date.now()) });
      res.end(content);
    }
  } catch {
    res.writeHead(code, { 'Content-Type': 'text/plain' });
    res.end(`${code} ${require('http').STATUS_CODES[code] || 'Error'}`);
  }
}

/**
 * Sirve un archivo con compresión
 */
async function serveFile(filePath, res, acceptEncoding) {
  const ext = path.extname(filePath);
  
  try {
    const stats = await fs.promises.stat(filePath);
    const mtime = stats.mtimeMs;
    const cacheHeaders = getCacheHeaders(ext, mtime);
    
    const content = await fs.promises.readFile(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';
    let contentToServe = content;
    
    if (ext === '.html') {
      const processed = await processIncludes(content.toString());
      contentToServe = Buffer.from(processed);
    }
    
    const encoding = getEncoding(acceptEncoding);
    if (encoding) {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Content-Encoding': encoding.type,
        'Vary': 'Accept-Encoding',
        ...cacheHeaders
      });
      
      const compressor = encoding.type === 'br' 
        ? zlib.createBrotliCompress() 
        : zlib.createGzip();
      
      compressor.pipe(res);
      compressor.end(contentToServe);
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        ...cacheHeaders
      });
      res.end(contentToServe);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      await serveError(res, 404, acceptEncoding);
    } else {
      await serveError(res, 500, acceptEncoding);
    }
  }
}

// Servir archivos estáticos con compression
/**
 * Helper para obtener cookies
 */
function getCookie(req, name) {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  const result = cookies.split(';').find(c => c.trim().startsWith(name + '='));
  return result ? result.split('=')[1] : null;
}

/**
 * Helper para setear cookies
 */
function setCookie(res, name, value, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  res.setHeader('Set-Cookie', `${name}=${value}; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`);
}

const server = http.createServer(async (req, res) => {
  try {
    const acceptEncoding = req.headers['accept-encoding'] || '';
    
    // Log de requests para debug
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // Headers de seguridad básicos para local
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Determinar la ruta del archivo
    let urlPath = req.url.split('?')[0];
  
  if (urlPath === '/') {
    urlPath = '/index.html';
  } else if (!path.extname(urlPath)) {
    // Intentar agregar .html
    const htmlPath = path.join(__dirname, urlPath + '.html');
    const indexPath = path.join(__dirname, urlPath, 'index.html');
    
    if (fs.existsSync(htmlPath)) {
      urlPath = urlPath + '.html';
    } else if (fs.existsSync(indexPath)) {
      urlPath = urlPath + '/index.html';
    } else {
      urlPath = urlPath + '.html';
    }
  }
  
  const fullPath = path.resolve(path.join(__dirname, urlPath));
  const rootPath = path.resolve(__dirname);
  
  // Prevenir directory traversal
  if (!fullPath.startsWith(rootPath)) {
    await serveError(res, 403, acceptEncoding);
    return;
  }
  
   // Verificar que el archivo existe
   if (!fs.existsSync(fullPath)) {
     await serveError(res, 404, acceptEncoding);
     return;
   }
  
   await serveFile(fullPath, res, acceptEncoding);
  } catch (e) {
    await serveError(res, 500, req.headers['accept-encoding'] || '');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Foxinix - Puerto: 80')
});
