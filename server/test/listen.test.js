import assert from 'node:assert/strict';
import net from 'node:net';
import { describe, test } from 'node:test';
import express from 'express';
import { startServer } from '../src/listen.js';

// Sunucunun açılışı. Express 5'te app.listen'in geri çağrısı port alınamadığında da çalışır ve hatayı argüman olarak
// verir; buna bakılmazsa sunucu port doluyken "çalışıyor" yazıp hiçbir şeyi dinlemeden açık kalır.
const HOST = '127.0.0.1';

describe('startServer', () => {
  test('resolves with a listening server on a free port', async () => {
    const server = await startServer(express(), 0, HOST);
    try {
      assert.ok(server.listening);
      assert.ok(server.address().port > 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('rejects with EADDRINUSE when the port is taken, instead of pretending to run', async () => {
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(0, HOST, resolve));
    const { port } = blocker.address();
    try {
      await assert.rejects(startServer(express(), port, HOST), { code: 'EADDRINUSE' });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});
