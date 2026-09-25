import {readFileSync} from 'node:fs';

const realNow = Date.now.bind(Date);
const clockFile = process.env.E2E_CLOCK_FILE;
if (clockFile) {
  Date.now = () => {
    try {
      const value = Number(readFileSync(clockFile, 'utf8').trim());
      if (Number.isFinite(value)) return value;
    } catch {}
    return realNow();
  };
}

const {application} = await import('../server/main.js');
const server = application({
  dbPath: process.env.DB_PATH || ':memory:',
  origin: process.env.APP_ORIGIN || '',
  allowSignup: process.env.ALLOW_SIGNUP !== 'false',
});
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`VocaLearn E2E: http://${host}:${port}`));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
