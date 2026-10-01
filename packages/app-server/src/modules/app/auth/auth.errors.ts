import { createErrorFactory } from '../../shared/errors/errors';

export const createUnauthorizedError = createErrorFactory({
  message: 'Unauthorized',
  code: 'auth.unauthorized',
  statusCode: 401,
});

export const createPasswordLoginDisabledError = createErrorFactory({
  message: 'Password login is disabled',
  code: 'auth.password-login-disabled',
  statusCode: 403,
});

export const createOidcLoginDisabledError = createErrorFactory({
  message: 'OIDC login is disabled',
  code: 'auth.oidc-login-disabled',
  statusCode: 404,
});
