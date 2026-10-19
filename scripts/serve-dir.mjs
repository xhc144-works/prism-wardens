// 极简静态文件服务器，供自动更新端到端测试模拟发布源：node scripts/serve-dir.mjs <目录> <端口>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [dir, port = '8765'] = process.argv.slice(2);
const root = path.resolve(dir);
http
  .createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.normalize(path.join(root, rel));
    const ok = file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile();
    console.log(`${req.method} ${rel} ${req.headers.range ?? ''} → ${ok ? 200 : 404}`);
    if (!ok) return res.writeHead(404).end();
    const size = fs.statSync(file).size;
    const ranges = [...(req.headers.range ?? '').matchAll(/(\d+)-(\d*)/g)].map((m) => [Number(m[1]), m[2] ? Number(m[2]) : size - 1]);
    if (ranges.length === 1) {
      const [start, end] = ranges[0];
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    if (ranges.length > 1) {
      // 多段范围请求（electron-updater 增量下载使用）：multipart/byteranges
      const boundary = 'prism-wardens-boundary';
      const fd = fs.openSync(file, 'r');
      const parts = ranges.map(([start, end]) => {
        const buf = Buffer.alloc(end - start + 1);
        fs.readSync(fd, buf, 0, buf.length, start);
        return Buffer.concat([Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Range: bytes ${start}-${end}/${size}\r\n\r\n`), buf]);
      });
      fs.closeSync(fd);
      const body = Buffer.concat([...parts, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      res.writeHead(206, { 'Content-Type': `multipart/byteranges; boundary=${boundary}`, 'Content-Length': body.length });
      return res.end(body);
    }
    res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(port), '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
