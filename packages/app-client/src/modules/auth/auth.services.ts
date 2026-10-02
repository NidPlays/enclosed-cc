import { getConfig } from '../config/config.provider';
import { apiClient } from '../shared/http/http-client';
import { buildUrl } from '../shared/http/http-client.models';

export { getOidcLoginUrl, login };

function getOidcLoginUrl() {
  const { baseApiUrl } = getConfig();

  return buildUrl({ path: 'api/auth/oidc/login', baseUrl: baseApiUrl });
}

async function login({ email, password }: { email: string; password: string }) {
  const { accessToken } = await apiClient<{ accessToken: string }>({
    path: 'api/auth/login',
    method: 'POST',
    body: {
      email,
      password,
    },
  });

  return { accessToken };
}
