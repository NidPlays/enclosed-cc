import { describe, expect, test } from 'vitest';
import { isOidcUserAllowed } from './oidc.models';

describe('oidc models', () => {
  describe('isOidcUserAllowed', () => {
    test('when no allowed emails are configured, any user authenticated by the provider is allowed', () => {
      expect(isOidcUserAllowed({ email: undefined, isEmailVerified: false, allowedEmails: [] })).to.eql(true);
      expect(isOidcUserAllowed({ email: 'foo@example.com', isEmailVerified: true, allowedEmails: [] })).to.eql(true);
    });

    test('when allowed emails are configured, only users with a verified email in the list are allowed, case insensitively', () => {
      const allowedEmails = ['foo@example.com'];

      expect(isOidcUserAllowed({ email: 'foo@example.com', isEmailVerified: true, allowedEmails })).to.eql(true);
      expect(isOidcUserAllowed({ email: 'FOO@Example.com', isEmailVerified: true, allowedEmails })).to.eql(true);
      expect(isOidcUserAllowed({ email: 'bar@example.com', isEmailVerified: true, allowedEmails })).to.eql(false);
      expect(isOidcUserAllowed({ email: 'foo@example.com', isEmailVerified: false, allowedEmails })).to.eql(false);
      expect(isOidcUserAllowed({ email: undefined, isEmailVerified: true, allowedEmails })).to.eql(false);
    });

    test('unverified emails can be explicitly accepted, for providers that do not verify emails', () => {
      const allowedEmails = ['foo@example.com'];

      expect(isOidcUserAllowed({ email: 'foo@example.com', isEmailVerified: false, allowedEmails, isUnverifiedEmailAllowed: true })).to.eql(true);
      expect(isOidcUserAllowed({ email: 'bar@example.com', isEmailVerified: false, allowedEmails, isUnverifiedEmailAllowed: true })).to.eql(false);
    });
  });
});
