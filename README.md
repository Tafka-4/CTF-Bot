# CTF-Bot (for CatN1p!)

This is a CTF management bot containing features I personally find necessary or useful. It was originally created for the CatN1p hacking team, but anyone can use it!

## Architecture Overview

The project is split into two runtimes:

- `bot/`: Discord bot that exposes slash commands, runs inside the provided container or any Node.js environment.
- `revshell/`: Reverse shell relay service (Express REST API + TCP bridge). It is intended to run on a separate host and is not included in the docker-compose stack by default.

### Reverse Shell Flow

1. Users run `/revshell create` from Discord.
2. The bot calls the external revshell REST API (HTTP 8000) to create a pairing.
3. Operators/targets connect to the revshell TCP listener (port 3000) to bridge shells.
4. Additional `/revshell status` and `/revshell close` commands use the same REST API.

### Deployment Notes

- Set `REVSHELL_HTTP_BASE_URL`, `REVSHELL_TCP_HOST`, and `REVSHELL_TCP_PORT` so the bot talks to the external revshell host.
- The revshell service should be deployed separately (e.g., via its own container pipeline) and kept online for both production and development.

---

* Appendix
CatN1p: https://ctftime.org/team/389809