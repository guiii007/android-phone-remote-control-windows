import { createRemoteServer } from './server.mjs';

const token = process.env.PAIRING_TOKEN;
if (!token || token.length < 32) throw new Error('请先设置 PAIRING_TOKEN，至少 32 字符。建议生成 32 字节随机密钥。');
const service = createRemoteServer({ token });
const port = Number(process.env.PORT || 8787);
const bind = process.env.BIND || '127.0.0.1';
service.server.listen(port, bind, () => console.log(`中转服务已启动：${bind}:${port}。公网使用时须由 HTTPS 反向代理提供入口。`));
process.on('SIGINT', async () => { await service.close(); process.exit(); });
