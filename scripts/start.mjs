// A production start must serve the built local interface even when a development
// .env is present. This command still binds loopback through validated API config.
process.env.NODE_ENV = 'production';
await import('../apps/api/dist/server.js');
