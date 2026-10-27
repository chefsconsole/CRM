# Integrations

None of these are required. EstateIQ runs fully without them.

| Integration | Env | Behaviour when not configured |
|---|---|---|
| **Email (Resend)** | `RESEND_API_KEY`, `EMAIL_FROM` | Messages are written to the Outbox (Admin → Settings) instead of being sent. Buyer sign-in codes are shown on screen in development only |
| **WhatsApp Business** | `WHATSAPP_PROVIDER`, `WHATSAPP_API_KEY` | Disabled. Even when enabled, a message is sent only to buyers with a recorded WHATSAPP consent, using approved templates |
| **Maps** | `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` | CARTO Positron raster tiles with attribution. Review CARTO's terms for commercial volume, or point this at MapTiler or Mapbox |
| **Imagery** | `NEXT_PUBLIC_IMAGE_MODE` | `remote` loads the illustrative photography (labelled as such). `plates` uses the built-in generated architectural artwork. Use only images you have rights to; never use developer renders without permission |
| **File storage** | `STORAGE_DIR` | Local disk. To use S3 or R2, swap the driver in `src/lib/storage.ts` (`put`/`get`/`remove`). Allowed types are PDF, PNG, JPEG and WebP, up to 10 MB |
| **Cron** | `CRON_SECRET` | Without it the sweep endpoint is disabled. Notifications still appear when pages load |

## Never commit secrets

`.env` is git-ignored. Configure keys in your host's secret manager.
