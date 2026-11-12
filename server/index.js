import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getDb, DATA_DIR } from './db.js';
import { authRoutes, requireAuth, publicUser } from './auth.js';
import { createApiRouter } from './api.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');

const argPortIndex = process.argv.findIndex((arg) => arg === '--port' || arg === '-p');
const portFromArgs =
  argPortIndex > -1 ? Number(process.argv[argPortIndex + 1]) : Number(process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1]);
const PORT = Number(process.env.PORT) || portFromArgs || 23090;
const HOST = process.env.HOST || '127.0.0.1';
const OPEN = process.argv.includes('--open');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '30mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'ClickUp Local', version: '1.4.1', time: new Date().toISOString() });
});

const authRouter = express.Router();
authRoutes(authRouter);
app.use('/api', authRouter);
app.use('/api', requireAuth, createApiRouter());

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        `<html><head><meta charset="utf-8"><title>ClickUp Local</title></head><body style="font-family:system-ui;padding:40px;line-height:1.7">
        <h1>ClickUp 本地版 API 已启动</h1>
        <p>前端尚未构建。开发模式请运行 <code>npm run dev</code>，生产模式请先运行 <code>npm run build</code>。</p>
        <p>API 健康检查：<a href="/api/health">/api/health</a></p></body></html>`
      );
  });
}

app.use((err, req, res, next) => {
  console.error('[api error]', err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || '服务器内部错误' });
});

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // The URL is printed below regardless.
  }
}

getDb();

const server = app.listen(PORT, HOST, () => {
  const url = `http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`;
  console.log('');
  console.log('  ╭──────────────────────────────────────────────╮');
  console.log('  │  ClickUp 本地版 · 团队工作操作系统            │');
  console.log('  ╰──────────────────────────────────────────────╯');
  console.log(`  访问地址   ${url}`);
  console.log(`  数据目录   ${DATA_DIR}`);
  console.log('  演示账号   demo@clickup.local / demo1234');
  console.log('');
  if (OPEN) openBrowser(url);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。请使用 --port 指定其他端口，例如：npm start -- --port 23100`);
  } else {
    console.error('服务启动失败：', error);
  }
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
