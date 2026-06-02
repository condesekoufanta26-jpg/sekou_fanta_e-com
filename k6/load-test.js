import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ─── Métriques personnalisées ───────────────────
const errorRate = new Rate('error_rate');
const loginDuration = new Trend('login_duration', true);
const productsDuration = new Trend('products_duration', true);
const orderDuration = new Trend('order_duration', true);
const correlationIdMissing = new Counter('correlation_id_missing');

// ─── Configuration de charge ────────────────────
export const options = {
  scenarios: {
    // Palier 1 : 10 VUs
    load_10: {
      executor: 'constant-vus',
      vus: 10,
      duration: '60s',
      startTime: '0s',
      tags: { scenario: '10vus' },
    },
    // Palier 2 : 50 VUs
    load_50: {
      executor: 'constant-vus',
      vus: 50,
      duration: '60s',
      startTime: '70s',
      tags: { scenario: '50vus' },
    },
    // Palier 3 : 100 VUs
    load_100: {
      executor: 'constant-vus',
      vus: 100,
      duration: '60s',
      startTime: '140s',
      tags: { scenario: '100vus' },
    },
    // Palier 4 : 200 VUs
    load_200: {
      executor: 'constant-vus',
      vus: 200,
      duration: '60s',
      startTime: '210s',
      tags: { scenario: '200vus' },
    },
    // Palier 5 : 500 VUs (stress test)
    load_500: {
      executor: 'constant-vus',
      vus: 500,
      duration: '300s',
      startTime: '280s',
      tags: { scenario: '500vus' },
    },
  },
  thresholds: {
    // Seuils de la thèse
    'http_req_duration{endpoint:products}': ['p(95)<500'],
    'http_req_duration{endpoint:login}': ['p(95)<1000'],
    error_rate: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://10.0.2.2:3000/api/v1';

// ─── Données de test ────────────────────────────
const TEST_USERS = [
  { email: 'test1@bench.com', password: 'Bench1234!' },
  { email: 'test2@bench.com', password: 'Bench1234!' },
  { email: 'test3@bench.com', password: 'Bench1234!' },
  { email: 'test4@bench.com', password: 'Bench1234!' },
  { email: 'test5@bench.com', password: 'Bench1234!' },
];

// ─── Setup : créer les utilisateurs de test ─────
export function setup() {
  for (const user of TEST_USERS) {
    http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({
        email: user.email,
        password: user.password,
        name: `Bench User ${user.email}`,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }
  return { users: TEST_USERS };
}

// ─── Scénario principal ─────────────────────────
export default function (data) {
  const user = data.users[__VU % data.users.length];

  // ── Étape 1 : Login ──────────────────────────
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: user.email, password: user.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'login' },
    },
  );

  loginDuration.add(loginRes.timings.duration);

  const loginOk = check(loginRes, {
    'login status 200/201': (r) => r.status === 200 || r.status === 201,
    'login has accessToken': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.data?.accessToken;
      } catch { return false; }
    },
    'login has correlationId': (r) => {
      // ✅ Vérification traceabilité — critère thèse
      const cid = r.headers['X-Correlation-Id'] || r.headers['x-correlation-id'];
      if (!cid) correlationIdMissing.add(1);
      return !!cid;
    },
  });

  errorRate.add(!loginOk);

  if (!loginOk) {
    sleep(1);
    return;
  }

  const token = JSON.parse(loginRes.body).data?.accessToken;

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  sleep(0.5);

  // ── Étape 2 : GET /products (public, avec cache Redis) ──
  const productsRes = http.get(
    `${BASE_URL}/products?page=1&limit=20`,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'products' },
    },
  );

  productsDuration.add(productsRes.timings.duration);

  const productsOk = check(productsRes, {
    'products status 200': (r) => r.status === 200,
    'products has data array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data?.data ?? body.data);
      } catch { return false; }
    },
    'products has correlationId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.correlationId && body.correlationId !== 'unknown';
      } catch { return false; }
    },
  });

  errorRate.add(!productsOk);

  sleep(0.5);

  // ── Étape 3 : GET /auth/me ───────────────────
  const meRes = http.get(`${BASE_URL}/auth/me`, {
    headers: authHeaders,
    tags: { endpoint: 'me' },
  });

  check(meRes, {
    'me status 200': (r) => r.status === 200,
    'me has userId': (r) => {
      try {
        return !!JSON.parse(r.body).data?.id;
      } catch { return false; }
    },
  });

  sleep(0.3);

  // ── Étape 4 : POST /cart ─────────────────────
  const productId = 2;
  const cartRes = http.post(
    `${BASE_URL}/cart`,
    JSON.stringify({ productId, quantity: 1 }),
    {
      headers: authHeaders,
      tags: { endpoint: 'cart' },
    },
  );

  check(cartRes, {
    'cart status 200/201': (r) => r.status === 200 || r.status === 201,
  });

  sleep(0.3);

  // ── Étape 5 : POST /orders ───────────────────
  const orderRes = http.post(
    `${BASE_URL}/orders`,
    JSON.stringify({
      shippingAddress: '123 Rue Test, Paris',
      paymentMethod: 'card',
    }),
    {
      headers: authHeaders,
      tags: { endpoint: 'orders' },
    },
  );

  orderDuration.add(orderRes.timings.duration);

  check(orderRes, {
    'order status 200/201': (r) => r.status === 200 || r.status === 201,
    'order has orderNumber': (r) => {
      try {
        return !!JSON.parse(r.body).data?.order_number;
      } catch { return false; }
    },
  });

  errorRate.add(orderRes.status >= 500);

  sleep(1);
}

// ─── Teardown : résumé ──────────────────────────
export function teardown(data) {
  console.log('Load test completed.');
}