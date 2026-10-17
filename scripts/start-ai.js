const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWin = process.platform === 'win32';
const venvPython = isWin
  ? path.join(__dirname, '..', 'ai-service', '.venv', 'Scripts', 'python.exe')
  : path.join(__dirname, '..', 'ai-service', '.venv', 'bin', 'python');

const pythonExe = fs.existsSync(venvPython) ? venvPython : 'python';
const aiDir = path.join(__dirname, '..', 'ai-service');

const host = process.env.AI_HOST || '0.0.0.0';
console.log(`[AI Runner] Starting FastAPI service with: ${pythonExe} on ${host}:8000`);

const child = spawn(
  pythonExe,
  ['-m', 'uvicorn', 'app.main:app', '--host', host, '--port', '8000', '--reload'],
  { cwd: aiDir, stdio: 'inherit', shell: true }
);

child.on('error', (err) => {
  console.error('[AI Runner] Failed to start AI service:', err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code || 0);
  }
});
