/**
 * Server-Sent Events (SSE) broadcaster for real-time updates to connected clients.
 */
const clients = new Set();

export function addSSEClient(req, res) {
  // Support both addSSEClient(res) and addSSEClient(req, res)
  const actualRes = res || req;
  const actualReq = res ? req : null;

  actualRes.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  try {
    actualRes.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);
  } catch {}

  clients.add(actualRes);

  const cleanup = () => {
    clearInterval(heartbeat);
    clients.delete(actualRes);
  };

  const heartbeat = setInterval(() => {
    try {
      actualRes.write(`: heartbeat\n\n`);
    } catch {
      cleanup();
    }
  }, 25000);

  if (actualReq) {
    actualReq.on('close', cleanup);
    actualReq.on('error', cleanup);
  }
  actualRes.on('close', cleanup);
  actualRes.on('error', cleanup);
}

export function broadcastSSE(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(message);
    } catch {
      clients.delete(client);
    }
  }
}
