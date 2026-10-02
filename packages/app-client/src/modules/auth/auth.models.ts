export {
  getOidcCallbackResult,
  isAccessTokenExpired,
};

function getOidcCallbackResult({ hash, search }: { hash: string; search: string }) {
  const accessToken = new URLSearchParams(hash.replace(/^#/, '')).get('accessToken') ?? undefined;
  const oidcError = new URLSearchParams(search).get('oidcError') ?? undefined;

  return { accessToken, oidcError };
}

function isAccessTokenExpired({ accessToken }: { accessToken: string }) {
  try {
    const token = JSON.parse(atob(accessToken.split('.')[1]));
    return token.exp < Date.now() / 1000;
  } catch {
    return true;
  }
}
