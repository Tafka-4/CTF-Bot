# CTF-Bot (for CatN1p!)

This is a CTF management bot containing features I personally find necessary or useful. It was originally created for the CatN1p hacking team, but anyone can use it!

## Architecture Overview

The project is split into two runtimes:

- `bot/`: Discord bot that exposes slash commands, runs inside the provided container or any Node.js environment.
- `revshell/`: Reverse shell relay service (Express REST API + TCP bridge). It now runs alongside the bot through the root `docker-compose.yml`, assuming the reverse-shell TCP port (default `3000`) is reachable from your Tailscale network or other tunnel.

### Reverse Shell Flow

1. Users run `/revshell create` from Discord.
2. The bot calls the external revshell REST API (HTTP 8000) to create a pairing.
3. Operators/targets connect to the revshell TCP listener (port 3000) to bridge shells.
4. Additional `/revshell status` and `/revshell close` commands use the same REST API.

### Deployment Notes

- Copy `env.example` to `.env` and populate the required secrets before running `docker compose up`.
- Point `REVSHELL_ACCESS_HOSTNAME` at a dedicated reverse-shell domain (for example `revshell.example.com` or your Tailscale DNS name); the service shares this host in generated commands.
- `REVSHELL_ACCESS_PORT` is the port advertised to operators/targets (defaults to `3000`); keep it aligned with your public tunnel or Tailscale funnel configuration.
- `REVSHELL_TCP_BIND_PORT` sets the host port that Docker binds to the reverse-shell listener (defaults to `3000`); change it if another process already occupies that port and point your tunnel at the new value (e.g. `tailscale funnel --tcp 3000 tcp://localhost:3300`).
- `REVSHELL_ACCESS_TLS` controls whether generated commands default to TLS (`openssl s_client`) or plain TCP (`nc`). Set it to `true` when your ingress (Cloudflare Tunnel, Tailscale Funnel with TLS, etc.) expects a TLS handshake.
- `REVSHELL_HTTP_PORT` controls the host port used to reach the revshell REST API (defaults to `8000`).
- Slash command output mirrors `REVSHELL_ACCESS_TLS`: 버튼으로 `Plain`/`TLS` 모드를 전환해 필요한 명령만 볼 수 있습니다.
- Adjust `REVSHELL_HTTP_BASE_URL`/`REVSHELL_TCP_HOST` if you deploy the revshell service somewhere other than the bundled container.

---

* Appendix
CatN1p: https://ctftime.org/team/389809
