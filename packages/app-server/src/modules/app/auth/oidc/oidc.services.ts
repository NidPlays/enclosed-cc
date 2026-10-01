import type { Config } from '../../config/config.types';
import * as oauth from 'oauth4webapi';

export {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  generateOidcFlowParameters,
  getOidcClient,
};

type OidcConfig = Config['authentication']['oidc'];

export type OidcClient = Awaited<ReturnType<typeof getOidcClient>>;

// Discovery documents are cached per issuer for the lifetime of the process / worker isolate
const authorizationServersCache = new Map<string, Promise<oauth.AuthorizationServer>>();

async function discoverAuthorizationServer({ issuerUrl }: { issuerUrl: string }) {
  const issuer = new URL(issuerUrl);

  const response = await oauth.discoveryRequest(issuer, {
    algorithm: 'oidc',
    // Allow plain http issuers (like a local provider), as explicitly configured by the instance owner
    [oauth.allowInsecureRequests]: issuer.protocol === 'http:',
  });

  return oauth.processDiscoveryResponse(issuer, response);
}

async function getAuthorizationServer({ issuerUrl }: { issuerUrl: string }) {
  const cached = authorizationServersCache.get(issuerUrl);

  if (cached) {
    return cached;
  }

  const authorizationServerPromise = discoverAuthorizationServer({ issuerUrl });
  authorizationServersCache.set(issuerUrl, authorizationServerPromise);

  // Do not cache failures, so a provider temporarily unavailable at startup does not break the login forever
  authorizationServerPromise.catch(() => authorizationServersCache.delete(issuerUrl));

  return authorizationServerPromise;
}

function createClientAuth({ clientSecret, tokenEndpointAuthMethod }: { clientSecret?: string; tokenEndpointAuthMethod: OidcConfig['tokenEndpointAuthMethod'] }): oauth.ClientAuth {
  if (!clientSecret) {
    return oauth.None();
  }

  if (tokenEndpointAuthMethod === 'client_secret_post') {
    return oauth.ClientSecretPost(clientSecret);
  }

  // oauth4webapi's ClientSecretBasic form-urlencodes the credentials (RFC 6749 2.3.1), but many providers
  // (like Pocket ID) do not decode them, so a client id with a dash (like a UUID) is not found. Use the raw credentials instead.
  return (_authorizationServer, client, _body, headers) => {
    const credentials = String.fromCharCode(...new TextEncoder().encode(`${client.client_id}:${clientSecret}`));
    headers.set('authorization', `Basic ${btoa(credentials)}`);
  };
}

async function getOidcClient({ oidcConfig }: { oidcConfig: OidcConfig }) {
  const { issuerUrl, clientId, clientSecret, tokenEndpointAuthMethod } = oidcConfig;

  if (!issuerUrl || !clientId) {
    throw new Error('OIDC is enabled but AUTHENTICATION_OIDC_ISSUER_URL or AUTHENTICATION_OIDC_CLIENT_ID is not set');
  }

  const authorizationServer = await getAuthorizationServer({ issuerUrl });

  return {
    authorizationServer,
    client: { client_id: clientId } satisfies oauth.Client,
    clientAuth: createClientAuth({ clientSecret, tokenEndpointAuthMethod }),
    allowInsecureRequests: new URL(issuerUrl).protocol === 'http:',
  };
}

async function generateOidcFlowParameters() {
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);

  return {
    state: oauth.generateRandomState(),
    nonce: oauth.generateRandomNonce(),
    codeVerifier,
    codeChallenge,
  };
}

function buildAuthorizationUrl({
  oidcClient: { authorizationServer, client },
  redirectUri,
  scopes,
  state,
  nonce,
  codeChallenge,
}: {
  oidcClient: OidcClient;
  redirectUri: string;
  scopes: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}) {
  if (!authorizationServer.authorization_endpoint) {
    throw new Error('The OIDC provider does not expose an authorization endpoint');
  }

  const authorizationUrl = new URL(authorizationServer.authorization_endpoint);

  authorizationUrl.searchParams.set('client_id', client.client_id);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', scopes);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('nonce', nonce);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');

  return { authorizationUrl: authorizationUrl.toString() };
}

async function exchangeAuthorizationCode({
  oidcClient: { authorizationServer, client, clientAuth, allowInsecureRequests },
  callbackUrl,
  redirectUri,
  state,
  nonce,
  codeVerifier,
}: {
  oidcClient: OidcClient;
  callbackUrl: URL;
  redirectUri: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}) {
  // Throws if the state does not match or if the provider returned an error (like access_denied)
  const callbackParameters = oauth.validateAuthResponse(authorizationServer, client, callbackUrl, state);

  const response = await oauth.authorizationCodeGrantRequest(
    authorizationServer,
    client,
    clientAuth,
    callbackParameters,
    redirectUri,
    codeVerifier,
    { [oauth.allowInsecureRequests]: allowInsecureRequests },
  );

  // Validates the ID token issuer, audience, expiration and nonce
  const result = await oauth.processAuthorizationCodeResponse(authorizationServer, client, response, {
    expectedNonce: nonce,
    requireIdToken: true,
  });

  const claims = oauth.getValidatedIdTokenClaims(result)!;

  return {
    subject: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    isEmailVerified: claims.email_verified !== false,
  };
}
