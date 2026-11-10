import { resolveProviderSecret } from './secrets.js';

export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}

export function getCashfreeConfig(overrideEnv?: 'sandbox' | 'production'): CashfreeConfig {
  const envAppId = (process.env.CASHFREE_APP_ID || '').trim();
  const { key: secretKey } = resolveProviderSecret('cashfree', 'CASHFREE_SECRET_KEY');
  const storedAppId = resolveProviderSecret('cashfree_app_id').key;

  const appId = envAppId || storedAppId || '';
  const environment =
    overrideEnv ||
    ((process.env.CASHFREE_ENV?.toLowerCase() === 'production' ? 'production' : 'sandbox') as
      | 'sandbox'
      | 'production');

  return {
    appId,
    secretKey,
    environment,
  };
}

export function getCashfreeBaseUrl(environment: 'sandbox' | 'production'): string {
  return environment === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

export async function testCashfreeConnection(config?: Partial<CashfreeConfig>): Promise<{
  connected: boolean;
  configured: boolean;
  latencyMs: number;
  message: string;
}> {
  const current = getCashfreeConfig(config?.environment);
  const appId = config?.appId?.trim() || current.appId;
  const secretKey = config?.secretKey?.trim() || current.secretKey;
  const env = config?.environment || current.environment;

  if (!appId || !secretKey) {
    return {
      connected: false,
      configured: false,
      latencyMs: 0,
      message: 'Cashfree App ID and Secret Key are not configured yet.',
    };
  }

  const startTime = Date.now();
  const baseUrl = getCashfreeBaseUrl(env);

  try {
    // Probe Cashfree credentials by querying orders list with limit=1
    const res = await fetch(`${baseUrl}/orders?limit=1`, {
      method: 'GET',
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2023-08-01',
        Accept: 'application/json',
      },
    });

    const latencyMs = Date.now() - startTime;
    if (res.status === 200 || res.status === 404) {
      return {
        connected: true,
        configured: true,
        latencyMs,
        message: `Cashfree (${env.toUpperCase()}) authenticated successfully (${latencyMs}ms). Ready for payments.`,
      };
    }

    const text = await res.text();
    let errorDetail = text;
    try {
      const parsed = JSON.parse(text);
      errorDetail = parsed.message || parsed.error || text;
    } catch {
      // ignore JSON parse error
    }

    return {
      connected: false,
      configured: true,
      latencyMs,
      message: `Cashfree authentication failed (HTTP ${res.status}): ${errorDetail}`,
    };
  } catch (err: any) {
    return {
      connected: false,
      configured: true,
      latencyMs: Date.now() - startTime,
      message: `Network error connecting to Cashfree (${env}): ${err?.message || 'Host unreachable'}`,
    };
  }
}

export interface CreateCashfreeOrderParams {
  orderId: string;
  orderAmount: number;
  orderCurrency?: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  returnUrl: string;
  notifyUrl?: string;
}

export async function createCashfreeOrder(params: CreateCashfreeOrderParams): Promise<{
  success: boolean;
  orderId: string;
  paymentSessionId?: string;
  cfOrder?: any;
  error?: string;
}> {
  const config = getCashfreeConfig();
  if (!config.appId || !config.secretKey) {
    return {
      success: false,
      orderId: params.orderId,
      error: 'Cashfree is not fully configured on the server. Please enter credentials in Admin Panel.',
    };
  }

  const baseUrl = getCashfreeBaseUrl(config.environment);
  const cleanPhone = (params.customerPhone || '9999999999').replace(/[^0-9]/g, '').slice(-10) || '9999999999';

  try {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'x-client-id': config.appId,
        'x-client-secret': config.secretKey,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: params.orderId,
        order_amount: Math.round(params.orderAmount * 100) / 100,
        order_currency: params.orderCurrency || 'INR',
        customer_details: {
          customer_id: params.customerId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 45) || 'cust_myai',
          customer_email: params.customerEmail,
          customer_phone: cleanPhone,
          customer_name: params.customerName || 'MY AI User',
        },
        order_meta: {
          return_url: params.returnUrl,
          notify_url: params.notifyUrl,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        orderId: params.orderId,
        error: data.message || data.error || `HTTP ${res.status}: Failed to create Cashfree order`,
      };
    }

    return {
      success: true,
      orderId: data.order_id || params.orderId,
      paymentSessionId: data.payment_session_id,
      cfOrder: data,
    };
  } catch (err: any) {
    return {
      success: false,
      orderId: params.orderId,
      error: err?.message || 'Network failure creating Cashfree order',
    };
  }
}

export async function verifyCashfreeOrder(orderId: string): Promise<{
  isPaid: boolean;
  status: string;
  orderAmount?: number;
  currency?: string;
  raw?: any;
  error?: string;
}> {
  const config = getCashfreeConfig();
  if (!config.appId || !config.secretKey) {
    return {
      isPaid: false,
      status: 'UNCONFIGURED',
      error: 'Cashfree credentials are not configured.',
    };
  }

  const baseUrl = getCashfreeBaseUrl(config.environment);

  try {
    const res = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: {
        'x-client-id': config.appId,
        'x-client-secret': config.secretKey,
        'x-api-version': '2023-08-01',
        Accept: 'application/json',
      },
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        isPaid: false,
        status: 'FETCH_ERROR',
        error: data.message || `Cashfree fetch error HTTP ${res.status}`,
      };
    }

    const orderStatus = (data.order_status || '').toUpperCase();
    const isPaid = orderStatus === 'PAID';

    return {
      isPaid,
      status: orderStatus,
      orderAmount: data.order_amount,
      currency: data.order_currency,
      raw: data,
    };
  } catch (err: any) {
    return {
      isPaid: false,
      status: 'NETWORK_ERROR',
      error: err?.message || 'Failed to query Cashfree order status',
    };
  }
}
