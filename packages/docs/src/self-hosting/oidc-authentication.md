# OIDC / SSO Authentication

When authentication is required (`PUBLIC_IS_AUTHENTICATION_REQUIRED=true`), Enclosed can let users log in with any OpenID Connect provider, such as [Pocket ID](https://pocket-id.org), Authelia, Authentik, Keycloak, Zitadel, Google, and others. It can be used alongside the email/password login, or replace it.

## How it works

Enclosed uses the standard authorization code flow with PKCE:

1. The user clicks on the `Login with <provider>` button and is redirected to the provider.
2. Once authenticated, the provider redirects the user back to `<your-enclosed-url>/api/auth/oidc/callback`.
3. Enclosed exchanges the code for an ID token with the provider, checks it (issuer, audience, expiration, nonce), optionally checks the user email against an allowlist, and issues a regular Enclosed session.

The provider configuration is discovered automatically from `<issuer>/.well-known/openid-configuration`. Notes stay end-to-end encrypted; the provider is only used to decide who can create notes.

## Provider setup

Register a new OIDC client (sometimes called an application) in your provider with:

- **Callback / redirect URL**: `https://enclosed.example.com/api/auth/oidc/callback`
- **Scopes**: `openid email profile`
- **PKCE**: enabled (Enclosed always uses `S256`)

Then copy the client ID and client secret. If your provider supports public clients (like Pocket ID's "Public client" option), you can use one instead and leave `AUTHENTICATION_OIDC_CLIENT_SECRET` empty: PKCE protects the flow.

## Controlling who can log in

::: tip Recommended: manage access in your provider
Enclosed lets in anyone the provider lets through, so the best place to control access is the provider itself, where users and groups are already managed. Changes apply immediately, without restarting Enclosed.

With **Pocket ID**, create a user group (for example `enclosed-users`), add the allowed users to it, then select it in the **Allowed User Groups** of the Enclosed OIDC client. Other users are stopped by Pocket ID with "You're not allowed to access this service" and never reach Enclosed.

Most providers have an equivalent: Authelia access control rules, Authentik application bindings, Keycloak client roles, and so on.
:::

If your provider cannot restrict access per application (for example, a shared or public provider like Google, where anyone with an account can authenticate), use Enclosed's own allowlists:

- `AUTHENTICATION_OIDC_ALLOWED_EMAILS`: a list of allowed emails.
- `AUTHENTICATION_OIDC_ALLOWED_EMAIL_DOMAINS`: a list of allowed email domains (an exact match, so `example.com` does not allow `sub.example.com`).

A user is allowed if their email **or** its domain is listed. If both lists are empty, the allowlists are disabled.

Allowlists only trust emails the provider marks as verified (`email_verified` set to `true`). A token without the claim is treated as unverified. If your provider does not verify emails, and users cannot change their own email, set `AUTHENTICATION_OIDC_ALLOW_UNVERIFIED_EMAILS=true`.

## Enclosed configuration

```bash
PUBLIC_IS_AUTHENTICATION_REQUIRED=true
AUTHENTICATION_JWT_SECRET=<a-long-random-secret>

AUTHENTICATION_OIDC_ENABLED=true
AUTHENTICATION_OIDC_PROVIDER_NAME="Pocket ID"
AUTHENTICATION_OIDC_ISSUER_URL=https://id.example.com
AUTHENTICATION_OIDC_CLIENT_ID=<client-id>
AUTHENTICATION_OIDC_CLIENT_SECRET=<client-secret>
AUTHENTICATION_OIDC_REDIRECT_URI=https://enclosed.example.com/api/auth/oidc/callback

# Optional, prefer restricting access in the provider (see above)
# AUTHENTICATION_OIDC_ALLOWED_EMAILS=alice@example.com,bob@example.com
# AUTHENTICATION_OIDC_ALLOWED_EMAIL_DOMAINS=example.com

# Optional: disable the email/password form to only use the provider
AUTHENTICATION_PASSWORD_LOGIN_ENABLED=false
```

| Variable | Description |
| --- | --- |
| `AUTHENTICATION_OIDC_ENABLED` | Show the OIDC login button and enable the OIDC routes. |
| `AUTHENTICATION_OIDC_PROVIDER_NAME` | The name shown in the login button (`SSO` by default). |
| `AUTHENTICATION_OIDC_ISSUER_URL` | The issuer URL of the provider. |
| `AUTHENTICATION_OIDC_CLIENT_ID` / `AUTHENTICATION_OIDC_CLIENT_SECRET` | The client credentials. Leave the secret empty for a public client. |
| `AUTHENTICATION_OIDC_REDIRECT_URI` | The callback URL registered in the provider. Strongly recommended behind a reverse proxy; otherwise it is derived from the incoming request. |
| `AUTHENTICATION_OIDC_SCOPES` | The requested scopes (`openid email profile` by default). |
| `AUTHENTICATION_OIDC_TOKEN_ENDPOINT_AUTH_METHOD` | `client_secret_basic` (default) or `client_secret_post`. |
| `AUTHENTICATION_OIDC_ALLOWED_EMAILS` | Comma-separated list of allowed emails. Prefer restricting access in the provider. |
| `AUTHENTICATION_OIDC_ALLOWED_EMAIL_DOMAINS` | Comma-separated list of allowed email domains. Prefer restricting access in the provider. |
| `AUTHENTICATION_OIDC_ALLOW_UNVERIFIED_EMAILS` | When an allowlist is used, accept emails the provider does not mark as verified (`false` by default). |
| `AUTHENTICATION_PASSWORD_LOGIN_ENABLED` | Set it to `false` to hide the email/password form and reject password logins. |

::: tip Pocket ID and the allowlists
Pocket ID marks emails as unverified by default. If you use Enclosed's allowlists with Pocket ID (rather than its Allowed User Groups), either enable **Emails verified** in Pocket ID's application configuration (recommended) or set `AUTHENTICATION_OIDC_ALLOW_UNVERIFIED_EMAILS=true`.
:::

::: warning
The OIDC flow relies on a signed cookie and on a redirect to `/login` on the same origin as the API, so Enclosed's frontend and API must be served from the same domain (the default for Docker deployments). Plain `http://` issuer URLs are accepted for local testing only.
:::
