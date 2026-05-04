const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 80;
const CACHE_DURATION = 60 * 60 * 24 * 7; // 1 semana en segundos

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
const componentCache = new Map();

/**
 * Carga un componente desde la carpeta components/
 */
async function loadComponent(componentName) {
  if (componentCache.has(componentName)) {
    return componentCache.get(componentName);
  }
  
  const componentPath = path.join(__dirname, 'components', `${componentName}.html`);
  
  try {
    const content = await fs.promises.readFile(componentPath, 'utf8');
    componentCache.set(componentName, content);
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
  const isStatic = ['.css', '.js', '.ico', '.webp', '.png', '.jpg', '.svg', '.woff2', '.ttf'].includes(ext);
  
  // No cachear JS durante desarrollo para evitar problemas
  const isDev = process.env.NODE_ENV !== 'production';
  
  if (isDev && ext === '.js') {
    return {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
  }
  
  if (isStatic) {
    return {
      'Cache-Control': `public, max-age=${CACHE_DURATION}`,
      'ETag': mtime ? `"${mtime}"` : `"${Date.now()}"`,
      'Expires': new Date(Date.now() + CACHE_DURATION * 1000).toUTCString()
    };
  }
  
  return {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
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
      try {
        const content404 = await fs.promises.readFile(path.join(__dirname, '404.html'));
        const encoding = getEncoding(acceptEncoding);
        
        if (encoding) {
          res.writeHead(200, { 
            'Content-Type': 'text/html',
            'Content-Encoding': encoding.type,
            ...getCacheHeaders('.html', Date.now())
          });
          const compressor = encoding.type === 'br' 
            ? zlib.createBrotliCompress() 
            : zlib.createGzip();
          compressor.pipe(res);
          compressor.end(content404);
        } else {
          res.writeHead(200, { 
            'Content-Type': 'text/html',
            ...getCacheHeaders('.html', Date.now())
          });
          res.end(content404);
        }
      } catch (err404) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
    } else {
      res.writeHead(500);
      res.end('500 Internal Server Error');
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
  const acceptEncoding = req.headers['accept-encoding'] || '';
  
  // Log de requests para debug
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
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
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }
  
  // Verificar que el archivo existe
  if (!fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>404 Not Found</h1></body></html>');
    return;
  }
  
  await serveFile(fullPath, res, acceptEncoding);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`,_____________________________________________________________,`);
  console.log(`| FoxWeb Servidor Optimizado - Puerto: ${PORT}                    |`);
  console.log(`|                                                              |`);
  console.log(`| Características activadas:                                  |`);
  console.log(`| ✓ Compresión Brotli/Gzip                                     |`);
  console.log(`| ✓ Includes para componentes (header/footer)                 |`);
  console.log(`| ✓ Cache headers para archivos estáticos                      |`);
  console.log(`| ✓ Headers de seguridad                                       |`);
  console.log(`|_____________________________________________________________|`);
  console.log(`| Presione Ctrl+C para Detener                                |`);
  console.log(`|_____________________________________________________________|`);
});
