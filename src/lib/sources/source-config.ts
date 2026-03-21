export interface SourceConnectionConfig {
  type: string;
  /** @deprecated Use `connectionId` for new connections. Kept for backward compatibility. */
  identifier?: string;
  /** Opaque key that maps to a credential stored in `.env.local`. */
  connectionId?: string;
  alias?: string;
  readOnly?: boolean;
  duckdbExtension?: string;
}
