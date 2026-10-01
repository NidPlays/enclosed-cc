import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryStorage } from '../../../storage/factories/memory.storage';
import { overrideConfig } from '../../config/config.test-utils';
import { createServer } from '../../server';
import { isJwtValid } from '../auth.services';

const issuer = 'https://id.example.com';

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createMockProvider({ email = 'foo@example.com' }: { email?: string } = {}) {
  const tokenRequests: { body: URLSearchParams; headers: Headers }[] = [];
  let nonce: string | undefined;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());

    if (url.pathname === '/.well-known/openid-configuration') {
      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/api/oidc/token`,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        id_token_signing_alg_values_supported: ['RS256'],
      });
    }

    if (url.pathname === '/api/oidc/token') {
      tokenRequests.push({ body: new URLSearchParams(String(init?.body)), headers: new Headers(init?.headers) });

      const now = Math.floor(Date.now() / 1000);
      // The ID token is received directly from the token endpoint over TLS, its signature is not checked (OIDC core 3.1.3.7)
      const idToken = [
        base64url({ alg: 'RS256', typ: 'JWT' }),
        base64url({ iss: issuer, sub: 'user-1', aud: 'enclosed-client-id', iat: now, exp: now + 60, nonce, email, email_verified: true }),
        'signature',
      ].join('.');

      return Response.json({ access_token: 'provider-access-token', token_type: 'Bearer', id_token: idToken, expires_in: 60 });
    }

    return new Response('Not found', { status: 404 });
  });

  return {
    fetchMock,
    tokenRequests,
    setNonce: (value: string) => {
      nonce = value;
    },
  };
}

function createApp({ allowedEmails = [], isOidcLoginEnabled = true }: { allowedEmails?: string[]; isOidcLoginEnabled?: boolean } = {}) {
  const config = overrideConfig({
    public: {
      isAuthenticationRequired: true,
      isOidcLoginEnabled,
      isPasswordLoginEnabled: false,
    },
    authentication: {
      oidc: {
        issuerUrl: issuer,
        clientId: 'enclosed-client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://enclosed.example.com/api/auth/oidc/callback',
        allowedEmails,
      },
    },
  });

  const { storage } = createMemoryStorage();
  const { app } = createServer({ storageFactory: () => ({ storage }), config });

  return { app, config };
}

async function startLogin({ app }: { app: ReturnType<typeof createApp>['app'] }) {
  const response = await app.request('/api/auth/oidc/login');
  const authorizationUrl = new URL(response.headers.get('Location')!);
  const cookie = response.headers.get('Set-Cookie')!.split(';')[0];

  return { response, authorizationUrl, cookie };
}

describe('e2e', () => {
  describe('auth oidc login', () => {
    let provider: ReturnType<typeof createMockProvider>;

    beforeEach(() => {
      provider = createMockProvider();
      vi.stubGlobal('fetch', provider.fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test('the login route redirects to the provider authorization endpoint with a PKCE challenge, and sets a signed flow cookie', async () => {
      const { app } = createApp();

      const { response, authorizationUrl } = await startLogin({ app });

      expect(response.status).to.eql(302);
      expect(authorizationUrl.origin + authorizationUrl.pathname).to.eql(`${issuer}/authorize`);
      expect(authorizationUrl.searchParams.get('client_id')).to.eql('enclosed-client-id');
      expect(authorizationUrl.searchParams.get('redirect_uri')).to.eql('https://enclosed.example.com/api/auth/oidc/callback');
      expect(authorizationUrl.searchParams.get('response_type')).to.eql('code');
      expect(authorizationUrl.searchParams.get('scope')).to.eql('openid email profile');
      expect(authorizationUrl.searchParams.get('code_challenge_method')).to.eql('S256');
      expect(authorizationUrl.searchParams.get('state')).to.be.a('string');
      expect(authorizationUrl.searchParams.get('nonce')).to.be.a('string');

      const setCookie = response.headers.get('Set-Cookie')!;
      expect(setCookie).to.include('enclosed_oidc_flow=');
      expect(setCookie).to.include('HttpOnly');
      expect(setCookie).to.include('Secure');
      expect(setCookie).to.include('SameSite=Lax');
      expect(setCookie).to.include('Path=/api/auth/oidc');
    });

    test('after a successful authentication on the provider, the callback redirects to the client login page with a valid access token', async () => {
      const { app, config } = createApp();

      const { authorizationUrl, cookie } = await startLogin({ app });
      const state = authorizationUrl.searchParams.get('state')!;
      provider.setNonce(authorizationUrl.searchParams.get('nonce')!);

      const response = await app.request(`/api/auth/oidc/callback?code=auth-code&state=${state}&iss=${encodeURIComponent(issuer)}`, {
        headers: { Cookie: cookie },
      });

      expect(response.status).to.eql(302);
      const location = response.headers.get('Location')!;
      expect(location.startsWith('/login#accessToken=')).to.eql(true);

      const accessToken = decodeURIComponent(location.split('accessToken=')[1]);
      expect(await isJwtValid({ token: accessToken, jwtSecret: config.authentication.jwtSecret })).to.eql(true);

      const [{ body, headers }] = provider.tokenRequests;
      expect(body.get('grant_type')).to.eql('authorization_code');
      expect(body.get('code')).to.eql('auth-code');
      expect(body.get('code_verifier')).to.be.a('string');
      // Credentials are sent raw, not form-urlencoded, as most providers do not decode them
      expect(headers.get('authorization')).to.eql(`Basic ${btoa('enclosed-client-id:client-secret')}`);
    });

    test('when the state does not match the one stored in the flow cookie, the authentication fails', async () => {
      const { app } = createApp();

      const { authorizationUrl, cookie } = await startLogin({ app });
      provider.setNonce(authorizationUrl.searchParams.get('nonce')!);

      const response = await app.request('/api/auth/oidc/callback?code=auth-code&state=forged-state', {
        headers: { Cookie: cookie },
      });

      expect(response.headers.get('Location')).to.eql('/login?oidcError=authentication-failed');
      expect(provider.tokenRequests).to.eql([]);
    });

    test('when the flow cookie is missing or tampered, the authentication fails', async () => {
      const { app } = createApp();

      const response = await app.request('/api/auth/oidc/callback?code=auth-code&state=some-state', {
        headers: { Cookie: 'enclosed_oidc_flow=tampered' },
      });

      expect(response.headers.get('Location')).to.eql('/login?oidcError=invalid-state');
    });

    test('when the user email is not in the allowed emails list, the access is denied', async () => {
      const { app } = createApp({ allowedEmails: ['someone-else@example.com'] });

      const { authorizationUrl, cookie } = await startLogin({ app });
      provider.setNonce(authorizationUrl.searchParams.get('nonce')!);

      const response = await app.request(`/api/auth/oidc/callback?code=auth-code&state=${authorizationUrl.searchParams.get('state')}`, {
        headers: { Cookie: cookie },
      });

      expect(response.headers.get('Location')).to.eql('/login?oidcError=access-denied');
    });

    test('when oidc login is disabled, the oidc routes are not available', async () => {
      const { app } = createApp({ isOidcLoginEnabled: false });

      const response = await app.request('/api/auth/oidc/login');

      expect(response.status).to.eql(404);
      expect(await response.json()).to.eql({ error: { code: 'auth.oidc-login-disabled', message: 'OIDC login is disabled' } });
    });

    test('when password login is disabled, the password login route is rejected', async () => {
      const { app } = createApp();

      const response = await app.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'foo@example.com', password: 'whatever' }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });

      expect(response.status).to.eql(403);
    });
  });
});
