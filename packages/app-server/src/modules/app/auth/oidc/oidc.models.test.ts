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

    test('when allowed email domains are configured, users with a verified email in one of these domains are allowed', () => {
      const allowedEmailDomains = ['example.com'];

      expect(isOidcUserAllowed({ email: 'foo@example.com', isEmailVerified: true, allowedEmails: [], allowedEmailDomains })).to.eql(true);
      expect(isOidcUserAllowed({ email: 'Foo@EXAMPLE.com', isEmailVerified: true, allowedEmails: [], allowedEmailDomains })).to.eql(true);
      expect(isOidcUserAllowed({ email: 'foo@sub.example.com', isEmailVerified: true, allowedEmails: [], allowedEmailDomains })).to.eql(false);
      expect(isOidcUserAllowed({ email: 'foo@example.com.evil.io', isEmailVerified: true, allowedEmails: [], allowedEmailDomains })).to.eql(false);
      expect(isOidcUserAllowed({ email: 'foo@example.com', isEmailVerified: false, allowedEmails: [], allowedEmailDomains })).to.eql(false);
    });

    test('allowed emails and allowed domains are combined, a user matching either is allowed', () => {
      const params = { isEmailVerified: true, allowedEmails: ['bar@other.com'], allowedEmailDomains: ['example.com'] };

      expect(isOidcUserAllowed({ email: 'foo@example.com', ...params })).to.eql(true);
      expect(isOidcUserAllowed({ email: 'bar@other.com', ...params })).to.eql(true);
      expect(isOidcUserAllowed({ email: 'baz@other.com', ...params })).to.eql(false);
    });

    test('unverified emails can be explicitly accepted, for providers that do not verify emails', () => {
      const allowedEmails = ['foo@example.com'];

      expect(isOidcUserAllowed({ email: 'foo@example.com', isEmailVerified: false, allowedEmails, isUnverifiedEmailAllowed: true })).to.eql(true);
      expect(isOidcUserAllowed({ email: 'bar@example.com', isEmailVerified: false, allowedEmails, isUnverifiedEmailAllowed: true })).to.eql(false);
    });
  });
});
