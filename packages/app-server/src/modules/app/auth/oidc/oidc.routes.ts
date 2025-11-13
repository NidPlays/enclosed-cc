import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Config } from '../../config/config.types';
import type { AppContext } from '../../app.types';
import { createOidcService } from './oidc.services';
import { oidcCallbackQueryParamsSchema } from './oidc.models';
import { createJwtToken } from '../auth.services';
import { createUnauthorizedError } from '../auth.errors';

export { createOidcRoutes };

function createOidcRoutes({ config }: { config: Config }) {
  const oidcRoutes = new Hono<AppContext>();

  // GET /api/auth/oidc/authorize?state=xxx&code_challenge=xxx
  // Initiates OIDC flow by redirecting to IdP
  oidcRoutes.get(
    '/authorize',
    zValidator('query', z.object({
      state: z.string().min(16),
      code_challenge: z.string().min(43).max(128),
    })),
    async (c) => {
      if (!config.authentication.oidc.isEnabled) {
        return c.json({ error: 'OIDC is not enabled' }, 400);
      }

      const { state, code_challenge } = c.req.valid('query');

      try {
        const oidcService = createOidcService({ config });
        const { authorizationUrl } = await oidcService.getAuthorizationUrl({
          state,
          codeChallenge: code_challenge,
        });

        return c.redirect(authorizationUrl);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return c.json({ error: errorMessage }, 500);
      }
    },
  );

  // GET /api/auth/oidc/callback?code=xxx&state=xxx
  // Receives callback from IdP and redirects to frontend with code and state
  oidcRoutes.get(
    '/callback',
    zValidator('query', oidcCallbackQueryParamsSchema),
    async (c) => {
      const { code, state, error, error_description } = c.req.valid('query');

      // If IdP returned an error, redirect to frontend with error
      if (error) {
        const frontendUrl = new URL(config.public.baseApiUrl, c.req.url);
        frontendUrl.pathname = '/auth/oidc/callback';
        frontendUrl.searchParams.set('error', error);
        if (error_description) {
          frontendUrl.searchParams.set('error_description', error_description);
        }
        return c.redirect(frontendUrl.toString());
      }

      // Redirect to frontend with code and state
      // Frontend will complete the token exchange
      const frontendUrl = new URL(config.public.baseApiUrl, c.req.url);
      frontendUrl.pathname = '/auth/oidc/callback';
      frontendUrl.searchParams.set('code', code);
      frontendUrl.searchParams.set('state', state);

      return c.redirect(frontendUrl.toString());
    },
  );

  // POST /api/auth/oidc/token
  // Exchanges authorization code for JWT token (requires code_verifier from client)
  oidcRoutes.post(
    '/token',
    zValidator('json', z.object({
      code: z.string(),
      state: z.string(),
      code_verifier: z.string().min(43).max(128),
    })),
    async (c) => {
      if (!config.authentication.oidc.isEnabled) {
        return c.json({ error: 'OIDC is not enabled' }, 400);
      }

      const { code, state, code_verifier } = await c.req.json();

      try {
        const oidcService = createOidcService({ config });

        // Exchange code for tokens and get user info
        const { userInfo } = await oidcService.handleCallback({
          code,
          state,
          codeVerifier: code_verifier,
        });

        // Check if user email is required
        if (!userInfo.email) {
          return c.json(
            createUnauthorizedError({ message: 'Email claim is required from OIDC provider' }),
            401,
          );
        }

        // Check if auto-registration is enabled or user exists
        const existingUsers = config.authentication.authUsers;
        const userExists = existingUsers.some(u => u.email === userInfo.email);

        if (!config.authentication.oidc.autoRegister && !userExists) {
          return c.json(
            createUnauthorizedError({ message: 'User not authorized. Auto-registration is disabled.' }),
            401,
          );
        }

        // Create JWT token for the user
        const { token } = await createJwtToken({
          jwtSecret: config.authentication.jwtSecret,
          durationSec: config.authentication.jwtDurationSeconds,
        });

        return c.json({
          token,
          user: {
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            sub: userInfo.sub,
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Token exchange failed';
        return c.json(
          createUnauthorizedError({ message: errorMessage }),
          401,
        );
      }
    },
  );

  // GET /api/auth/oidc/config
  // Returns OIDC configuration for frontend
  oidcRoutes.get('/config', (c) => {
    return c.json({
      enabled: config.authentication.oidc.isEnabled,
      issuer: config.authentication.oidc.issuer,
      clientId: config.authentication.oidc.clientId,
      scopes: config.authentication.oidc.scopes,
    });
  });

  return oidcRoutes;
}
