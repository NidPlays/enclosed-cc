export { isOidcUserAllowed };

function isOidcUserAllowed({
  email,
  isEmailVerified,
  allowedEmails,
  isUnverifiedEmailAllowed = false,
}: {
  email?: string;
  isEmailVerified: boolean;
  allowedEmails: string[];
  isUnverifiedEmailAllowed?: boolean;
}) {
  if (allowedEmails.length === 0) {
    return true;
  }

  if (!email || (!isEmailVerified && !isUnverifiedEmailAllowed)) {
    return false;
  }

  return allowedEmails.includes(email.trim().toLowerCase());
}
