process.env.PORT ??= '8724';
process.env.DATABASE_URL ??= 'postgres://nenko:nenko_dev_password@127.0.0.1:55437/nenko';

await import('./index.mjs');
