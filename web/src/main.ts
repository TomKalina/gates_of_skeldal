import { PORT_NAME, PORT_VERSION } from './version';

const app = document.getElementById('app');
if (app) {
  app.textContent = `${PORT_NAME} ${PORT_VERSION} — TypeScript port scaffold. Nothing to see yet.`;
}
