import { describe, expect, test } from 'vitest';
import { generateCodeVerifier, generatePkceChallenge, generateState } from './oidc.services';

describe('oidc services', () => {
  describe('generateCodeVerifier', () => {
    test('generates a code verifier of 128 characters', () => {
      const { codeVerifier } = generateCodeVerifier();

      expect(codeVerifier).toHaveLength(128);
    });

    test('generates a code verifier with URL-safe characters', () => {
      const { codeVerifier } = generateCodeVerifier();

      expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    test('generates different code verifiers on each call', () => {
      const { codeVerifier: verifier1 } = generateCodeVerifier();
      const { codeVerifier: verifier2 } = generateCodeVerifier();

      expect(verifier1).not.toEqual(verifier2);
    });
  });

  describe('generateState', () => {
    test('generates a state of 32 characters', () => {
      const { state } = generateState();

      expect(state).toHaveLength(32);
    });

    test('generates different states on each call', () => {
      const { state: state1 } = generateState();
      const { state: state2 } = generateState();

      expect(state1).not.toEqual(state2);
    });
  });

  describe('generatePkceChallenge', () => {
    test('generates a base64url encoded SHA-256 hash of the code verifier', async () => {
      const codeVerifier = 'test-code-verifier-with-sufficient-length-to-meet-pkce-requirements-min-43-chars';
      const { codeChallenge } = await generatePkceChallenge({ codeVerifier });

      // Base64url encoded SHA-256 hash should be 43 characters
      expect(codeChallenge).toHaveLength(43);
      expect(codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    test('generates the same challenge for the same verifier', async () => {
      const codeVerifier = 'consistent-test-verifier-for-deterministic-hash-generation-min-43';
      const { codeChallenge: challenge1 } = await generatePkceChallenge({ codeVerifier });
      const { codeChallenge: challenge2 } = await generatePkceChallenge({ codeVerifier });

      expect(challenge1).toEqual(challenge2);
    });

    test('generates different challenges for different verifiers', async () => {
      const verifier1 = 'first-test-verifier-with-sufficient-length-min-43-chars-aaaaa';
      const verifier2 = 'second-test-verifier-with-sufficient-length-min-43-chars-bbbb';

      const { codeChallenge: challenge1 } = await generatePkceChallenge({ codeVerifier: verifier1 });
      const { codeChallenge: challenge2 } = await generatePkceChallenge({ codeVerifier: verifier2 });

      expect(challenge1).not.toEqual(challenge2);
    });
  });
});
