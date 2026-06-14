const LIBPQ_KV_SEGMENT_PATTERN =
  /\b(?:host|port|user|password|passfile|dbname|database|sslmode|connect_timeout)=\S+/gi;
const CREDENTIAL_URI_PATTERN = /\b(?:postgres(?:ql)?|mysql):\/\/[^\s`'"]+/gi;

function hasLibpqConnectionSegments(message: string): boolean {
  const matches = message.match(LIBPQ_KV_SEGMENT_PATTERN) ?? [];
  if (matches.length < 2) {
    return false;
  }

  return matches.some((segment) =>
    segment.toLowerCase().startsWith("password="),
  );
}

function redactLibpqConnectionStrings(message: string): string {
  if (!hasLibpqConnectionSegments(message)) {
    return message;
  }

  return message.replace(/`[^`]*password=[^`]*`/gi, "`<redacted connection>`");
}

function redactCredentialUris(message: string): string {
  return message.replace(CREDENTIAL_URI_PATTERN, (candidate) => {
    try {
      const parsed = new URL(candidate);
      if (!parsed.username && !parsed.password) {
        return candidate;
      }
      return "<redacted connection>";
    } catch {
      return candidate;
    }
  });
}

export function sanitizeSqlErrorMessage(message: string): string {
  return redactCredentialUris(redactLibpqConnectionStrings(message));
}
