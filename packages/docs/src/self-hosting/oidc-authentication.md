# OIDC Authentication Setup

Enclosed supports OpenID Connect (OIDC) authentication as a public client, allowing users to sign in using Single Sign-On (SSO) providers like Google, Azure AD, Keycloak, Auth0, and any other OIDC-compliant identity provider.

## Overview

OIDC authentication in Enclosed uses the **Authorization Code Flow with PKCE** (Proof Key for Code Exchange), which is the secure standard for public clients (web applications). This means:

- **No client secret required** - the application runs in the browser and cannot securely store secrets
- **PKCE protection** - prevents authorization code interception attacks
- **Seamless integration** - works alongside existing email/password authentication

## Configuration

To enable OIDC authentication, configure the following environment variables:

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AUTHENTICATION_OIDC_ENABLED` | Enable OIDC authentication | `true` |
| `AUTHENTICATION_OIDC_ISSUER` | The OIDC issuer URL | `https://accounts.google.com` |
| `AUTHENTICATION_OIDC_CLIENT_ID` | The OIDC client ID (public client) | `your-client-id.apps.googleusercontent.com` |
| `AUTHENTICATION_OIDC_REDIRECT_URI` | The callback URL for your app | `https://enclosed.example.com/api/auth/oidc/callback` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTHENTICATION_OIDC_ONLY` | Enable OIDC-only mode (disables email/password login) | `false` |
| `AUTHENTICATION_OIDC_SCOPES` | Comma-separated list of OIDC scopes | `openid,profile,email` |
| `AUTHENTICATION_OIDC_AUTO_REGISTER` | Auto-create users from OIDC claims | `true` |
| `AUTHENTICATION_OIDC_ALLOWED_DOMAINS` | Restrict to specific email domains (comma-separated) | *(empty - allow all)* |

## Provider Setup Examples

### Google OAuth 2.0

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Select **Web application** as the application type
6. Add authorized redirect URI: `https://your-domain.com/api/auth/oidc/callback`
7. Copy the Client ID (no client secret needed for public clients)

**Configuration:**
```bash
AUTHENTICATION_OIDC_ENABLED=true
AUTHENTICATION_OIDC_ISSUER=https://accounts.google.com
AUTHENTICATION_OIDC_CLIENT_ID=your-client-id.apps.googleusercontent.com
AUTHENTICATION_OIDC_REDIRECT_URI=https://your-domain.com/api/auth/oidc/callback
AUTHENTICATION_OIDC_SCOPES=openid,profile,email
```

### Azure AD (Microsoft Entra ID)

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Set redirect URI: `https://your-domain.com/api/auth/oidc/callback`
5. Under **Authentication**, enable "Public client flows"
6. Copy the Application (client) ID and Directory (tenant) ID

**Configuration:**
```bash
AUTHENTICATION_OIDC_ENABLED=true
AUTHENTICATION_OIDC_ISSUER=https://login.microsoftonline.com/{tenant-id}/v2.0
AUTHENTICATION_OIDC_CLIENT_ID=your-application-client-id
AUTHENTICATION_OIDC_REDIRECT_URI=https://your-domain.com/api/auth/oidc/callback
AUTHENTICATION_OIDC_SCOPES=openid,profile,email
```

### Keycloak

1. Log in to your Keycloak admin console
2. Select your realm
3. Go to **Clients** > **Create**
4. Set Client ID and enable "Public client"
5. Add valid redirect URI: `https://your-domain.com/api/auth/oidc/callback`
6. Save the client

**Configuration:**
```bash
AUTHENTICATION_OIDC_ENABLED=true
AUTHENTICATION_OIDC_ISSUER=https://keycloak.example.com/realms/{realm-name}
AUTHENTICATION_OIDC_CLIENT_ID=enclosed-client
AUTHENTICATION_OIDC_REDIRECT_URI=https://your-domain.com/api/auth/oidc/callback
AUTHENTICATION_OIDC_SCOPES=openid,profile,email
```

### Auth0

1. Go to [Auth0 Dashboard](https://manage.auth0.com/)
2. Navigate to **Applications** > **Create Application**
3. Select **Single Page Application**
4. Add Allowed Callback URL: `https://your-domain.com/api/auth/oidc/callback`
5. Copy the Domain and Client ID

**Configuration:**
```bash
AUTHENTICATION_OIDC_ENABLED=true
AUTHENTICATION_OIDC_ISSUER=https://your-tenant.auth0.com
AUTHENTICATION_OIDC_CLIENT_ID=your-client-id
AUTHENTICATION_OIDC_REDIRECT_URI=https://your-domain.com/api/auth/oidc/callback
AUTHENTICATION_OIDC_SCOPES=openid,profile,email
```

## Security Features

### PKCE (Proof Key for Code Exchange)

PKCE protects against authorization code interception attacks. The flow works as follows:

1. **Client generates** a random `code_verifier` (128 characters)
2. **Client creates** a `code_challenge` by hashing the verifier with SHA-256
3. **Authorization request** includes the code_challenge
4. **Identity provider** returns an authorization code
5. **Token exchange** requires the original code_verifier to complete

This ensures that even if an attacker intercepts the authorization code, they cannot exchange it for tokens without the code_verifier.

### State Parameter

The state parameter provides CSRF protection by:
- Being generated randomly for each authorization request
- Being validated on callback to ensure the response matches the request
- Preventing attackers from injecting malicious authorization responses

### Domain Restrictions

You can restrict OIDC authentication to specific email domains:

```bash
AUTHENTICATION_OIDC_ALLOWED_DOMAINS=example.com,company.org
```

This ensures only users from allowed domains can authenticate, even if they have valid credentials from the identity provider.

## User Management

### Auto-Registration

By default, `AUTHENTICATION_OIDC_AUTO_REGISTER=true` allows any user from the OIDC provider to authenticate automatically.

### Manual User Control

To require pre-approved users:

1. Set `AUTHENTICATION_OIDC_AUTO_REGISTER=false`
2. Add approved users to `AUTHENTICATION_USERS` (email only, no password hash needed for OIDC users)

Example:
```bash
AUTHENTICATION_OIDC_AUTO_REGISTER=false
AUTHENTICATION_USERS=alice@example.com:,bob@example.com:
```

Note: The colon after the email is required, but the password hash can be empty for OIDC-only users.

## Authentication Modes

### Hybrid Authentication (Default)

By default, OIDC authentication works alongside traditional email/password authentication. Users can choose their preferred login method on the login page.

To use both methods:
```bash
# Enable password authentication
AUTHENTICATION_USERS=admin@example.com:$2a$10$...password-hash...

# Enable OIDC authentication
AUTHENTICATION_OIDC_ENABLED=true
AUTHENTICATION_OIDC_ISSUER=https://accounts.google.com
AUTHENTICATION_OIDC_CLIENT_ID=your-client-id
AUTHENTICATION_OIDC_REDIRECT_URI=https://your-domain.com/api/auth/oidc/callback
```

The login page will display both the email/password form and a "Sign in with SSO" button.

### OIDC-Only Mode

For organizations that want to enforce SSO-only authentication, you can disable traditional email/password login entirely:

```bash
AUTHENTICATION_OIDC_ENABLED=true
AUTHENTICATION_OIDC_ONLY=true
AUTHENTICATION_OIDC_ISSUER=https://your-pocketid.example.com
AUTHENTICATION_OIDC_CLIENT_ID=your-client-id
AUTHENTICATION_OIDC_REDIRECT_URI=https://enclosed.example.com/api/auth/oidc/callback
```

When `AUTHENTICATION_OIDC_ONLY=true`:
- The email/password form is completely hidden from the login page
- Only the "Sign in with SSO" button is displayed
- API endpoint `/api/auth/login` rejects password authentication requests with HTTP 403
- Users must authenticate via your OIDC provider

**Benefits of OIDC-only mode:**
- Enforces centralized authentication through your identity provider
- Prevents password-based authentication bypass attempts
- Simplifies user experience with a single login method
- Leverages your IdP's access control (groups, MFA, conditional access, etc.)
- Ideal for PocketID, Keycloak, Azure AD with group-based access control

## Docker Example

Here's a complete Docker example with OIDC enabled:

```bash
docker run -d \
  --name enclosed \
  --restart unless-stopped \
  -p 8787:8787 \
  -v /path/to/local/data:/app/.data \
  -e PUBLIC_IS_AUTHENTICATION_REQUIRED=true \
  -e AUTHENTICATION_OIDC_ENABLED=true \
  -e AUTHENTICATION_OIDC_ISSUER=https://accounts.google.com \
  -e AUTHENTICATION_OIDC_CLIENT_ID=your-client-id.apps.googleusercontent.com \
  -e AUTHENTICATION_OIDC_REDIRECT_URI=https://enclosed.example.com/api/auth/oidc/callback \
  -e AUTHENTICATION_OIDC_SCOPES=openid,profile,email \
  -e AUTHENTICATION_OIDC_AUTO_REGISTER=true \
  ghcr.io/corentinth/enclosed
```

## Troubleshooting

### "OIDC is not enabled" error

Ensure `AUTHENTICATION_OIDC_ENABLED=true` is set. The button will automatically hide if OIDC is not enabled.

### "Invalid redirect URI" error from IdP

Make sure the redirect URI in your OIDC provider configuration **exactly matches** the `AUTHENTICATION_OIDC_REDIRECT_URI` value, including:
- Protocol (http vs https)
- Domain name
- Port (if not default)
- Path (`/api/auth/oidc/callback`)

### "Email domain not allowed" error

If you're using `AUTHENTICATION_OIDC_ALLOWED_DOMAINS`, ensure the user's email domain is in the allowed list.

### "User not authorized" error

If `AUTHENTICATION_OIDC_AUTO_REGISTER=false`, the user must be pre-configured in `AUTHENTICATION_USERS`.

### Discovery endpoint errors

Enclosed automatically discovers OIDC endpoints using the issuer's `.well-known/openid-configuration` document. Ensure:
- The issuer URL is correct and accessible
- The identity provider supports OIDC Discovery
- Network connectivity exists between Enclosed and the identity provider

## Security Considerations

1. **Always use HTTPS** in production - OIDC requires secure communication
2. **Validate redirect URIs** - ensure your IdP only allows your application's callback URL
3. **Regular token rotation** - JWT tokens expire based on `AUTHENTICATION_JWT_DURATION_SECONDS`
4. **Monitor failed attempts** - check logs for suspicious authentication patterns
5. **Domain restrictions** - use `AUTHENTICATION_OIDC_ALLOWED_DOMAINS` for organizational deployments

## Next Steps

- [Configure other settings](./configuration)
- [Set up Docker Compose](./docker-compose)
- [Manage user authentication](./users-authentication-key-generator)
