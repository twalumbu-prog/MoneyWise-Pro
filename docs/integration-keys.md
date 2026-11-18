# Where integration keys are kept

Local, preview and production all use the same database, so a key saved in one place must be readable by every other. Anything encrypted with a key from one server's own settings breaks that (the other server can't open it and says "no key set").

| Integration | Where the key lives | Readable from every server? |
|---|---|---|
| Lenco (public key, secret key, account id) | `organizations.lenco_*` columns, plain | Yes |
| Card payments, Lipila (API key, webhook secret) | `org_gateway_credentials.lipila_api_key_enc` / `lipila_webhook_secret_enc`, stored as `plain:<value>` | Yes (new saves). An older encrypted value is readable only by a server that has the encryption key it was saved with. |
| QuickBooks tokens | encrypted with `QB_TOKEN_ENCRYPTION_KEY` | Only if every server has the same key |
| Gmail and Meta tokens | encrypted with `MESSAGING_TOKEN_KEY` | Only if every server has the same key |

## Lipila keys

- The columns keep their old names (`…_enc`) so no schema change was needed. A value starting with `plain:` is the key itself; anything else is an older encrypted key.
- The table is server-only (no access for the app's users or the public key), the same arrangement Master Fees uses for its schools.
- **Saving** always stores `plain:`, so it works on any server whether or not it has an encryption key.
- **An older encrypted key** is read if this server has the encryption key it was saved with. On the live servers (`VERCEL` is set) the first read rewrites it as `plain:`, after which every server can read it. Elsewhere that only happens with `LIPILA_MIGRATE_KEYS=true`, so a local run never rewrites live data by accident.
- **A key this server can't open** is reported in settings ("saved earlier by a different server") and refused for saving without pasting it again. Pasting it once stores it for everyone.
- **Rotating a key** is just saving a new one.

Deploy the API before relying on this: a server running the old code can't read a `plain:` value.
