import { env } from "../env.js";
import { SessionService } from "../services/session.service.js";
import { makePassthrough, PassthroughServer } from "./passthough-proxy.js";
import { Server } from "proxy-chain";

export interface IProxyServer {
  readonly url: string;
  readonly upstreamProxyUrl: string;
  readonly txBytes: number;
  readonly rxBytes: number;
  listen(): Promise<void>;
  close(force?: boolean): Promise<void>;
}

export class ProxyServer extends Server implements IProxyServer {
  public url: string;
  public upstreamProxyUrl: string;
  public txBytes = 0;
  public rxBytes = 0;
  private hostConnections = new Set<number>();

  constructor(proxyUrl: string) {
    super({
      port: 0,

      prepareRequestFunction: (options) => {
        const { connectionId, hostname } = options;

        const internalBypassTests = new Set(["0.0.0.0", process.env.HOST]);

        if (env.PROXY_INTERNAL_BYPASS) {
          for (const host of env.PROXY_INTERNAL_BYPASS.split(",")) {
            internalBypassTests.add(host.trim());
          }
        }

        const isInternalBypass = internalBypassTests.has(hostname);

        if (isInternalBypass) {
          this.hostConnections.add(connectionId);
          return {
            customConnectServer: PassthroughServer,
            customResponseFunction: makePassthrough(options),
          };
        }
        return {
          requestAuthentication: false,
          upstreamProxyUrl: proxyUrl,
        };
      },
    });

    this.on("connectionClosed", ({ connectionId, stats }) => {
      if (stats && !this.hostConnections.has(connectionId)) {
        this.txBytes += stats.trgTxBytes;
        this.rxBytes += stats.trgRxBytes;
      }
      this.hostConnections.delete(connectionId);
    });

    this.url = `http://127.0.0.1:${this.port}`;
    this.upstreamProxyUrl = proxyUrl;
  }

  async listen(): Promise<void> {
    await super.listen();
    this.url = `http://127.0.0.1:${this.port}`;
  }
}
