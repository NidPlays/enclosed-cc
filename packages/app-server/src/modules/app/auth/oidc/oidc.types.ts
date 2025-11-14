import type { z } from 'zod';
import type { oidcCallbackQueryParamsSchema, oidcUserInfoSchema } from './oidc.models';

export type OidcCallbackQueryParams = z.infer<typeof oidcCallbackQueryParamsSchema>;
export type OidcUserInfo = z.infer<typeof oidcUserInfoSchema>;

export type OidcDiscoveryDocument = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
};

export type OidcTokens = {
  access_token: string;
  token_type: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
};
