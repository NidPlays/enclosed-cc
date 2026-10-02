export { isOidcUserAllowed };

function isOidcUserAllowed({
  email,
  isEmailVerified,
  allowedEmails,
  allowedEmailDomains = [],
  isUnverifiedEmailAllowed = false,
}: {
  email?: string;
  isEmailVerified: boolean;
  allowedEmails: string[];
  allowedEmailDomains?: string[];
  isUnverifiedEmailAllowed?: boolean;
}) {
  if (allowedEmails.length === 0 && allowedEmailDomains.length === 0) {
    return true;
  }

  if (!email || (!isEmailVerified && !isUnverifiedEmailAllowed)) {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.split('@').pop();

  return allowedEmails.includes(normalizedEmail) || (domain !== undefined && allowedEmailDomains.includes(domain));
}
