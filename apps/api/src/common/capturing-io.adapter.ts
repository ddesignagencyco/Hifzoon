import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server } from 'socket.io';

/**
 * Socket.IO adapter that keeps a handle on the parent `Server`.
 *
 * Why this exists rather than a `afterInit` hook on the gateway:
 *
 * `@nestjs/websockets` injects the **namespace** server into a gateway that declares a
 * `namespace` in its decorator, and the parent `Server` into one that does not. The
 * Socket.IO Redis adapter is installed with `server.adapter(...)`, and a `Namespace`
 * has no such method — only the parent does. So a namespaced gateway trying to attach
 * the adapter itself gets `this.server.adapter is not a function`, which is the exact
 * error this class was written to eliminate.
 *
 * Overriding `createIOServer` is the one place that sees the parent instance for
 * certain, so we capture it there and hand the gateway a usable handle.
 */
export class CapturingIoAdapter extends IoAdapter {
  private ioServer?: Server;

  override createIOServer(port: number, options?: Record<string, unknown>): Server {
    const server = super.createIOServer(port, options ?? {});
    this.ioServer = server;
    return server;
  }

  /** The parent Socket.IO server, or null before `createIOServer` has run. */
  get parentServer(): Server | undefined {
    return this.ioServer;
  }

  /**
   * Installs the Redis adapter on the parent server so that rooms fan out across API
   * instances (TRD section 4.2, NFR-CAP-01).
   *
   * Failing is non-fatal: a single-instance machine should still work with Redis down,
   * just without cross-instance fan-out. Redis health is reported by the readiness
   * probe instead of being enforced here.
   */
  async attachRedisAdapter(pubClient: unknown, subClient: unknown): Promise<boolean> {
    if (!this.ioServer) return false;
    const { createAdapter } = await import('@socket.io/redis-adapter');
    this.ioServer.adapter(createAdapter(pubClient, subClient));
    return true;
  }
}
