import http from 'http';

const options = {
  host: '127.0.0.1',
  port: process.env.PORT || 5000,
  path: '/health',
  method: 'GET',
  timeout: 8000,
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.on('error', () => {
  process.exit(1);
});

req.end();
