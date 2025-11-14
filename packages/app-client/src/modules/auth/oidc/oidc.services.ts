import { httpClient } from '@/modules/shared/http/http-client';
import { generateCodeChallenge, generateCodeVerifier, generateState } from './oidc.models';

export { initiateOidcLogin, handleOidcCallback, getOidcConfig };

type OidcConfig = {
  enabled: boolean;
  onlyOidc: boolean;
  issuer?: string;
  clientId?: string;
  scopes?: string[];
};

async function getOidcConfig(): Promise<OidcConfig> {
  const response = await httpClient.get('/api/auth/oidc/config');
  return response.json();
}

async function initiateOidcLogin() {
  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Store PKCE parameters in sessionStorage for callback
  sessionStorage.setItem('oidc_code_verifier', codeVerifier);
  sessionStorage.setItem('oidc_state', state);

  // Build authorization URL
  const baseUrl = window.location.origin;
  const authUrl = new URL(`${baseUrl}/api/auth/oidc/authorize`);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);

  // Redirect to OIDC authorization endpoint (via backend)
  window.location.href = authUrl.toString();
}

async function handleOidcCallback({ code, state, error, error_description }: {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}): Promise<{ accessToken: string; user: { email: string; name?: string; picture?: string; sub: string } }> {
  // Check for errors from IdP
  if (error) {
    throw new Error(error_description || error);
  }

  if (!code || !state) {
    throw new Error('Missing code or state parameter');
  }

  // Retrieve stored PKCE parameters
  const storedCodeVerifier = sessionStorage.getItem('oidc_code_verifier');
  const storedState = sessionStorage.getItem('oidc_state');

  // Clean up sessionStorage
  sessionStorage.removeItem('oidc_code_verifier');
  sessionStorage.removeItem('oidc_state');

  if (!storedCodeVerifier || !storedState) {
    throw new Error('PKCE parameters not found in session');
  }

  // Validate state (CSRF protection)
  if (state !== storedState) {
    throw new Error('Invalid state parameter');
  }

  // Exchange code for token
  const response = await httpClient.post('/api/auth/oidc/token', {
    json: {
      code,
      state,
      code_verifier: storedCodeVerifier,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Token exchange failed');
  }

  return response.json();
}
