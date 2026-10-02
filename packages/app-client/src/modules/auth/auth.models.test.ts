import { describe, expect, test } from 'vitest';
import { getOidcCallbackResult } from './auth.models';

describe('auth models', () => {
  describe('getOidcCallbackResult', () => {
    test('the access token is extracted from the url fragment set by the oidc callback', () => {
      expect(getOidcCallbackResult({ hash: '#accessToken=abc.def.ghi', search: '' })).to.eql({ accessToken: 'abc.def.ghi', oidcError: undefined });
    });

    test('the oidc error is extracted from the query string', () => {
      expect(getOidcCallbackResult({ hash: '', search: '?oidcError=access-denied' })).to.eql({ accessToken: undefined, oidcError: 'access-denied' });
    });

    test('nothing is extracted when the url does not come from an oidc callback', () => {
      expect(getOidcCallbackResult({ hash: '', search: '' })).to.eql({ accessToken: undefined, oidcError: undefined });
    });
  });
});
