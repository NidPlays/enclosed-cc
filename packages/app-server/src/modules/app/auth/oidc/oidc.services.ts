import * as oauth from 'openid-client';
import type { Config } from '../../config/config.types';
import type { OidcUserInfo } from './oidc.types';
import { oidcUserInfoSchema } from './oidc.models';
import { createRandomString } from './oidc.models';

export { createOidcService };

function createOidcService({ config }: { config: Config }) {
  const oidcConfig = config.authentication.oidc;

  if (!oidcConfig.isEnabled) {
    throw new Error('OIDC is not enabled');
  }

  if (!oidcConfig.issuer || !oidcConfig.clientId || !oidcConfig.redirectUri) {
    throw new Error('OIDC configuration is incomplete. Required: issuer, clientId, redirectUri');
  }

  let discoveryCache: oauth.Configuration | null = null;

  return {
    getAuthorizationUrl,
    handleCallback,
    validatePkceChallenge,
    isOidcEnabled,
  };

  function isOidcEnabled(): boolean {
    return oidcConfig.isEnabled;
  }

  async function getDiscoveryDocument(): Promise<oauth.Configuration> {
    if (discoveryCache) {
      return discoveryCache;
    }

    const issuerUrl = new URL(oidcConfig.issuer!);
    const discoveryResponse = await oauth.discovery(issuerUrl, oidcConfig.clientId!);

    discoveryCache = discoveryResponse;
    return discoveryResponse;
  }

  async function getAuthorizationUrl({ state, codeChallenge }: { state: string; codeChallenge: string }): Promise<{ authorizationUrl: string }> {
    const config = await getDiscoveryDocument();

    const authorizationUrl = new URL(config.serverMetadata().authorization_endpoint!);

    const params = {
      client_id: oidcConfig.clientId!,
      redirect_uri: oidcConfig.redirectUri!,
      response_type: 'code',
      scope: oidcConfig.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    };

    Object.entries(params).forEach(([key, value]) => {
      authorizationUrl.searchParams.set(key, value);
    });

    return { authorizationUrl: authorizationUrl.toString() };
  }

  async function handleCallback({
    code,
    state,
    codeVerifier,
  }: {
    code: string;
    state: string;
    codeVerifier: string;
  }): Promise<{ userInfo: OidcUserInfo; accessToken: string; idToken?: string }> {
    const config = await getDiscoveryDocument();

    // Exchange authorization code for tokens
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', oidcConfig.redirectUri!);
    params.set('client_id', oidcConfig.clientId!);
    params.set('code_verifier', codeVerifier);

    const tokenResponse = await oauth.genericTokenEndpointRequest(
      config,
      oidcConfig.clientId!,
      params,
      { [oauth.skipAuthTimeCheck]: true },
    );

    const challenges = oauth.getValidatedIdTokenClaims(tokenResponse);

    // Validate state and nonce if present in claims
    if (challenges.nonce && challenges.nonce !== state) {
      throw new Error('Invalid nonce in ID token');
    }

    // Get user info from userinfo endpoint
    const accessToken = tokenResponse.access_token;
    const userInfoResponse = await oauth.fetchUserInfo(
      config,
      accessToken,
      challenges.sub,
    );

    const userInfo = oidcUserInfoSchema.parse(userInfoResponse);

    // Validate email domain if restrictions are configured
    if (oidcConfig.allowedDomains.length > 0 && userInfo.email) {
      const emailDomain = userInfo.email.split('@')[1]?.toLowerCase();
      if (!emailDomain || !oidcConfig.allowedDomains.includes(emailDomain)) {
        throw new Error(`Email domain ${emailDomain} is not allowed`);
      }
    }

    return {
      userInfo,
      accessToken,
      idToken: tokenResponse.id_token,
    };
  }

  function validatePkceChallenge({ codeVerifier, codeChallenge }: { codeVerifier: string; codeChallenge: string }): { isValid: boolean } {
    // Generate SHA-256 hash of code_verifier
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);

    return crypto.subtle.digest('SHA-256', data)
      .then((hashBuffer) => {
        // Convert to base64url
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const base64 = btoa(String.fromCharCode(...hashArray));
        const base64url = base64
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');

        return { isValid: base64url === codeChallenge };
      })
      .catch(() => {
        return { isValid: false };
      });
  }
}

export function generatePkceChallenge({ codeVerifier }: { codeVerifier: string }): Promise<{ codeChallenge: string }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);

  return crypto.subtle.digest('SHA-256', data)
    .then((hashBuffer) => {
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const base64 = btoa(String.fromCharCode(...hashArray));
      const base64url = base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      return { codeChallenge: base64url };
    });
}

export function generateCodeVerifier(): { codeVerifier: string } {
  const codeVerifier = createRandomString({ length: 128 });
  return { codeVerifier };
}

export function generateState(): { state: string } {
  const state = createRandomString({ length: 32 });
  return { state };
}
