import type { Context, ServerInstance } from '../../server.types';
import { safely } from '@corentinth/chisels';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createLogger } from '../../../shared/logger/logger';
import { createOidcLoginDisabledError } from '../auth.errors';
import { createJwtToken } from '../auth.services';
import { isOidcUserAllowed } from './oidc.models';
import { buildAuthorizationUrl, exchangeAuthorizationCode, generateOidcFlowParameters, getOidcClient } from './oidc.services';

export { registerOidcRoutes };

const logger = createLogger({ namespace: 'auth:oidc' });

const OIDC_FLOW_COOKIE_NAME = 'enclosed_oidc_flow';
const OIDC_FLOW_COOKIE_PATH = '/api/auth/oidc';
const OIDC_FLOW_COOKIE_MAX_AGE_SECONDS = 60 * 10;
const OIDC_CALLBACK_PATH = '/api/auth/oidc/callback';
const CLIENT_LOGIN_PATH = '/login';

function registerOidcRoutes({ app }: { app: ServerInstance }) {
  setupOidcLoginRoute({ app });
  setupOidcCallbackRoute({ app });
}

function getRedirectUri({ context }: { context: Context }) {
  const { redirectUri } = context.get('config').authentication.oidc;

  return redirectUri ?? new URL(OIDC_CALLBACK_PATH, context.req.url).toString();
}

function assertOidcLoginEnabled({ context }: { context: Context }) {
  const { isAuthenticationRequired, isOidcLoginEnabled } = context.get('config').public;

  if (!isAuthenticationRequired || !isOidcLoginEnabled) {
    throw createOidcLoginDisabledError();
  }
}

function redirectToClientLoginWithError({ context, error }: { context: Context; error: string }) {
  return context.redirect(`${CLIENT_LOGIN_PATH}?oidcError=${encodeURIComponent(error)}`);
}

function setupOidcLoginRoute({ app }: { app: ServerInstance }) {
  app.get('/api/auth/oidc/login', async (context) => {
    assertOidcLoginEnabled({ context });

    const config = context.get('config');
    const redirectUri = getRedirectUri({ context });

    const [oidcClient, error] = await safely(getOidcClient({ oidcConfig: config.authentication.oidc }));

    if (error) {
      logger.error({ error }, 'Failed to discover the OIDC provider configuration');
      return redirectToClientLoginWithError({ context, error: 'provider-unavailable' });
    }

    const { state, nonce, codeVerifier, codeChallenge } = await generateOidcFlowParameters();

    const { authorizationUrl } = buildAuthorizationUrl({
      oidcClient,
      redirectUri,
      scopes: config.authentication.oidc.scopes,
      state,
      nonce,
      codeChallenge,
    });

    // The flow parameters are kept in a short-lived signed cookie, so no server side storage is needed
    await setSignedCookie(
      context,
      OIDC_FLOW_COOKIE_NAME,
      JSON.stringify({ state, nonce, codeVerifier }),
      config.authentication.jwtSecret,
      {
        path: OIDC_FLOW_COOKIE_PATH,
        httpOnly: true,
        // Lax is required for the cookie to be sent on the top-level redirect from the provider
        sameSite: 'Lax',
        secure: new URL(redirectUri).protocol === 'https:',
        maxAge: OIDC_FLOW_COOKIE_MAX_AGE_SECONDS,
      },
    );

    return context.redirect(authorizationUrl);
  });
}

function setupOidcCallbackRoute({ app }: { app: ServerInstance }) {
  app.get(OIDC_CALLBACK_PATH, async (context) => {
    assertOidcLoginEnabled({ context });

    const config = context.get('config');

    const flowCookie = await getSignedCookie(context, config.authentication.jwtSecret, OIDC_FLOW_COOKIE_NAME);
    deleteCookie(context, OIDC_FLOW_COOKIE_NAME, { path: OIDC_FLOW_COOKIE_PATH });

    if (!flowCookie) {
      return redirectToClientLoginWithError({ context, error: 'invalid-state' });
    }

    const { state, nonce, codeVerifier } = JSON.parse(flowCookie) as { state: string; nonce: string; codeVerifier: string };

    const [oidcClient, clientError] = await safely(getOidcClient({ oidcConfig: config.authentication.oidc }));

    if (clientError) {
      logger.error({ error: clientError }, 'Failed to discover the OIDC provider configuration');
      return redirectToClientLoginWithError({ context, error: 'provider-unavailable' });
    }

    const [user, exchangeError] = await safely(exchangeAuthorizationCode({
      oidcClient,
      callbackUrl: new URL(context.req.url),
      redirectUri: getRedirectUri({ context }),
      state,
      nonce,
      codeVerifier,
    }));

    if (exchangeError) {
      logger.warn({ error: exchangeError }, 'OIDC authentication failed');
      return redirectToClientLoginWithError({ context, error: 'authentication-failed' });
    }

    const { allowedEmails, allowedEmailDomains, isUnverifiedEmailAllowed } = config.authentication.oidc;

    if (!isOidcUserAllowed({ ...user, allowedEmails, allowedEmailDomains, isUnverifiedEmailAllowed })) {
      logger.warn({ subject: user.subject, email: user.email, isEmailVerified: user.isEmailVerified }, 'OIDC user not allowed to log in');
      return redirectToClientLoginWithError({ context, error: 'access-denied' });
    }

    const { token } = await createJwtToken({
      jwtSecret: config.authentication.jwtSecret,
      durationSec: config.authentication.jwtDurationSeconds,
    });

    // The token is passed in the URL fragment so it is never sent to a server nor logged
    return context.redirect(`${CLIENT_LOGIN_PATH}#accessToken=${encodeURIComponent(token)}`);
  });
}
