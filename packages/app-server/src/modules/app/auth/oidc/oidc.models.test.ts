import { describe, expect, test } from 'vitest';
import { createRandomString } from './oidc.models';

describe('oidc models', () => {
  describe('createRandomString', () => {
    test('generates a random string of the specified length', () => {
      const length = 128;
      const result = createRandomString({ length });

      expect(result).toHaveLength(length);
    });

    test('generates a random string with valid URL-safe characters', () => {
      const result = createRandomString({ length: 128 });

      // Should only contain URL-safe characters: A-Z, a-z, 0-9, -, ., _, ~
      expect(result).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    test('generates different strings on each call', () => {
      const result1 = createRandomString({ length: 128 });
      const result2 = createRandomString({ length: 128 });

      expect(result1).not.toEqual(result2);
    });

    test('generates a string of minimum PKCE length (43)', () => {
      const result = createRandomString({ length: 43 });

      expect(result).toHaveLength(43);
    });
  });
});
