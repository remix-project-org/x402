/**
 * Wraps a transport to handle x402 payment flow automatically
 */
export class X402TransportWrapper {
  constructor(transport, treasurer) {
    this.transport = transport;
    this.treasurer = treasurer;
    this.pendingRequests = new Map();
    this.pendingResolvers = new Map();

    this._setupInterception();
  }

  _setupInterception() {
    const originalSend = this.transport.send.bind(this.transport);
    const originalOnMessage = this.transport.onmessage;

    // Intercept send to track requests
    this.transport.send = (message) => {
      if ("id" in message && "method" in message) {
        this.pendingRequests.set(message.id, message);
      }
      return originalSend(message);
    };

    // Intercept onmessage to handle 402 responses
    this.transport.onmessage = async (response) => {
      await this._handleResponse(response, originalSend, originalOnMessage);
    };
  }

  async _handleResponse(response, originalSend, originalOnMessage) {
    // Handle 402 Payment Required
    if ("id" in response && "error" in response && response.error?.code === 402) {
      const handled = await this._handle402Response(response, originalSend);
      if (handled) return;
    }

    // Handle successful payment
    if ("id" in response && "result" in response) {
      await this._handleSuccessfulPayment(response);
    }

    // Cleanup and forward
    if ("id" in response) this.pendingRequests.delete(response.id);
    if (originalOnMessage) originalOnMessage(response);
  }

  async _handle402Response(response, originalSend) {
    const originalRequest = this.pendingRequests.get(response.id);

    if (originalRequest && response.error?.data?.x402Version && response.error?.data?.accepts) {
      // Avoid retry loop
      if (originalRequest.params?._meta?.["x402/payment"]) {
        return false;
      }

      const authorization = await this.treasurer.onPaymentRequired(
        response.error.data.accepts,
        { method: originalRequest.method, params: originalRequest.params }
      );

      if (!authorization) {
        return false;
      }

      await this.treasurer.onStatus("sending", authorization);

      // Retry with payment
      const retryRequest = {
        ...originalRequest,
        params: {
          ...originalRequest.params,
          _meta: {
            ...originalRequest.params?._meta,
            "x402/payment": authorization.payment,
          }
        }
      };

      this.pendingResolvers.set(originalRequest.id, authorization);
      originalSend(retryRequest);
      return true;
    }

    return false;
  }

  async _handleSuccessfulPayment(response) {
    const authorization = this.pendingResolvers.get(response.id);
    if (authorization) {
      await this.treasurer.onStatus("accepted", authorization);
      this.pendingResolvers.delete(response.id);

      if (globalThis.__retryResolver) {
        globalThis.__retryResolver(response.result);
        globalThis.__retryResolver = null;
      }
    }
  }
}
