import { createServer } from 'vite';

const port = Number.parseInt(process.env.PORT ?? '5173', 10);

const server = await createServer({
  configFile: './vite.config.js',
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
});

await server.listen();
server.printUrls();

async function close() {
  await server.close();
  process.exit(0);
}

process.on('SIGINT', close);
process.on('SIGTERM', close);

setInterval(() => {}, 2_147_483_647);
