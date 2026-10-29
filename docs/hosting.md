# Hosting on matrix.example.com

The plan for moving Priority Matrix from the claude.ai artifact to the owner's VPS (ADR 0003). Each step is its own card, branch and pull request, done in order: plan, build, verify, then the next. The claude.ai version keeps working until step 5 is done.

## Steps

| # | Card | What it delivers | Who | Estimate |
|---|---|---|---|---|
| 1 | Server | `server/`: the API (tasks, labels, checked saves, changes), secret-key check, one JSON file per account, the account command (`create`, `list`, `revoke`), limits and logs; tested locally | Claude | 1 day |
| 2 | App on the server | New HTTP storage adapter; the app reads the key from the link, keeps it on the device and polls for changes; normal browser download for Export; storage picked by where the app runs | Claude | 0.5 day |
| 3 | Deploy | `deploy/`: Docker Compose with Caddy and the server; HTTPS for matrix.example.com (#71); first deploy; security headers checked | Claude writes, the owner runs on the VPS | 0.5 day |
| 4 | Testers | Tester accounts created and links sent. The data move from claude.ai was not needed (the owner started fresh); its import command is parked on branch `75-import-backup` | The owner | 10 minutes |
| 5 | Backups | Nightly copy of the data folder, kept 30 days; a restore tried once | Claude writes, the owner runs | 2 hours |

About 2.5 days in all. Architecture review 6 comes after these (they count as features).

## What the owner does on the VPS (step 3 onwards)
Claude cannot log into the VPS. For each step Claude gives the exact commands and what the screen should show; The owner runs them over SSH and pastes back the result (never a key or password).

Before step 3, Claude needs to know:
- the VPS operating system and version (for example Ubuntu 24.04);
- whether Docker is installed;
- whether example.com's DNS is managed in the DNS provider's panel.

Setup the owner does once, with Claude's instructions in step 3:
- sign-in through Tailscale only (Tailscale SSH); the normal SSH service is off, so port 22 is closed to the internet;
- a firewall that allows only ports 80 and 443 (web), plus the private Tailscale network;
- automatic security updates;
- a read-only deploy key so the VPS can pull this private repo from GitHub (the private half never leaves the VPS);
- the DNS record pointing example.com at the VPS (a manual change in the DNS provider's panel, recorded in `docs/progress.md`).

## Step 3 runbook: first deploy (the owner, on the VPS)

Run each block as your admin user, signed in through Tailscale (`ssh <vps-host>` from the Mac), one at a time, and check the result before the next. Never paste a key, password or link into a chat. If something looks different from what is described, stop and send Claude the output.

**Before you start:** this repo's `main` branch must contain `deploy/` (merged with #66). Keep one session open the whole time; open a second one only when a step says so. the VPS provider's browser terminal (in its control panel) is the way back in if Tailscale ever locks you out.

### 1. Updates, and automatic security updates
```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```
Expect: the last command asks "Automatically download and install stable updates?"; answer Yes. If the upgrade mentions a new kernel, run `sudo reboot` and sign in again.

### 2. Sign in through Tailscale only
This VPS signs in through Tailscale SSH (Q99: a, #69): nothing on the internet to guess passwords against, and no keys to manage. First check that Tailscale SSH is on:
```bash
sudo tailscale debug prefs | grep -i runssh
```
Expect: `"RunSSH": true`. If not, stop and ask Claude.

Then write safe settings for the normal SSH service, in case it is ever turned back on, and turn it off:
```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' | sudo tee /etc/ssh/sshd_config.d/00-priority-matrix.conf
sudo systemctl disable --now ssh.socket ssh.service
```
The `00-` name matters: SSH keeps the first value it reads, and files in that folder are read in name order, so a later file (such as the provider's `50-cloud-init.conf`) cannot turn passwords back on. A note that "triggering units are still active" is harmless; the check below confirms.

Expect: **without closing this session**, open a second terminal on the Mac and run `ssh <vps-host>`. Only if that works, close the first. Then check that nothing listens on port 22:
```bash
systemctl is-active ssh.socket ssh.service
sudo ss -ltn 'sport = :22'
```
Expect: `inactive` twice, and only the header line from `ss`.

### 3. Firewall
```bash
sudo ufw allow in on tailscale0
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status
```
Expect: `Status: active` with `tailscale0`, 80 and 443 allowed. The `tailscale0` line comes first because without it the firewall would block your Tailscale sign-in. `ufw enable` warns that it may disrupt SSH connections; answer `y` (the `tailscale0` rule keeps yours), then check `ssh <vps-host>` from a second terminal. Docker publishes only ports 80 and 443 here, so nothing else is exposed. If your provider also has a firewall for the VPS, allow 80 and 443 there; port 22 is not needed.

### 4. Docker, from Docker's own package source
```bash
sudo apt -y install ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker run --rm hello-world
```
Expect: "Hello from Docker!". Keep using `sudo docker`; adding yourself to the `docker` group would make that account as powerful as root.

### 5. The code
The repo is public, so the VPS clones it over HTTPS with no key:
```bash
sudo mkdir -p /opt/priority-matrix && sudo chown "$USER": /opt/priority-matrix
git clone https://github.com/coldlight-labs/priority-matrix.git /opt/priority-matrix
```
Expect: "Cloning into ..." with no errors. (Until the repo went public, step 5 used a read-only deploy key for a private repo; see "Switching to the public repo" below.)

### 6. Point the domain at the VPS
In your provider's control panel, note the VPS's IPv4 address. Then open the DNS settings for your domain:
- Add `matrix`: an `A` record to the VPS's IPv4 address (TTL 300). This is the app's address (#71). Use `A`, not a `CNAME` to the main domain, so the app stays on the VPS if the main domain moves elsewhere.
- For now the main domain also points at the VPS, where Caddy sends it to the app with a temporary redirect: edit the `A` record for `@` to the VPS's IPv4 address (TTL 300), and delete any other `A` or `AAAA` record for `@` (for example the parking one).
- Add or edit `www`: a `CNAME` to `example.com`.

Tell Claude when it is done; Claude checks from outside when the new address is visible (minutes to a few hours).

### 7. Start
First set your addresses in `deploy/.env`, which stays on the VPS and out of git (#74). Replace both example values with your own:
```bash
cp /opt/priority-matrix/deploy/.env.example /opt/priority-matrix/deploy/.env
nano /opt/priority-matrix/deploy/.env
```
Then:
```bash
/opt/priority-matrix/deploy/update.sh
```
Expect, after a few minutes of building: both services "Up", then `Site answers 200 (expect 200); API without a key answers 401 (expect 401).` and `Done.` The first HTTPS certificate can take a minute; if the check fails right after DNS changed, wait two minutes and run it again.

Then open https://matrix.example.com on your phone. Expect the page "Open your personal link to use this page." Check that the padlock shows and the fonts look like the app.

### 8. Your account
```bash
sudo docker compose -f /opt/priority-matrix/deploy/compose.yaml exec server node cli.js create owner --empty
```
It prints your link once. Save it in your password manager, then open it on your phone and laptop. Do not paste it to Claude. Your data comes over in step 4.

## Step 5 runbook: backups (#77, once, then automatic)
Every night at about 03:30 (server time) the VPS saves the app's data to `/var/backups/priority-matrix`, one file per night, kept 30 days. The provider's weekly whole-VPS backups are the second layer, for losing the VPS itself. Backups hold every account's data, testers' too, so they stay on the VPS, readable by root only.

1. Update, which also installs the nightly timer:
   ```bash
   /opt/priority-matrix/deploy/update.sh
   ```
   Expect, near the end: `Next backup:` with tonight's date.
2. Restore drill (about 5 minutes; proves a restore works):
   1. Take a backup now: `sudo /opt/priority-matrix/deploy/backup.sh`. Expect `Backed up to ... 1 backups kept.`
   2. In the app, add a task called "Restore test".
   3. Restore the backup you just took (use the file name printed in step 1):
      ```bash
      sudo /opt/priority-matrix/deploy/restore.sh /var/backups/priority-matrix/<file>.tar.gz
      ```
      Type `RESTORE` when asked. It takes a safety backup first.
   4. Reload the app. Expect "Restore test" to be gone.

Later:
- See the backups: `sudo ls -lh /var/backups/priority-matrix`
- See last night's run: `journalctl -u priority-matrix-backup --since yesterday`
- Restore after a mistake: step 2.3 with the night you want. Everything since that night is lost, so pick the latest good one.

## Read-only API access for an external assistant (#7)
The server can issue a separate read-only key for an active account. It can call only `GET /api/data`, which returns **all tasks and labels** for that account. It cannot create, edit, or delete anything. This is a server capability only; it does not configure Hermes or send it a key.

On the VPS, run the account command inside the server container as an administrator:
```bash
sudo docker compose -f /opt/priority-matrix/deploy/compose.yaml exec server node cli.js create-read-only-key owner
```
The key is printed once. Store it in an approved secrets manager and provide it to the client through that manager's secure mechanism; never paste it into chat, a note, shell history, or a repository. The command prints a key id alongside it. Keep the id (not the secret) so this key can be revoked later:
```bash
sudo docker compose -f /opt/priority-matrix/deploy/compose.yaml exec server node cli.js revoke-read-only-key owner <key-id>
```
The browser's existing full-access link remains unchanged. Revoking a read-only key does not revoke that link or affect task data.

## Scoped task-writer API access (#9)

A task-writer key can create a task only when its id is unused, or update an existing task only when the submitted loaded copy still matches the server's copy. Checked task updates include status changes. The same key can create a label and conditionally rename, recolor, archive, or restore an existing label. The label-update route compares the submitted loaded label with current storage and enforces active-name uniqueness. The key cannot retrieve account data, use the unrestricted upsert endpoint, administer accounts, or permanently delete tasks. Dropping a task to the reversible Graveyard status uses the checked update route. Read access remains a separate read-only key.

On the VPS, run the account command inside the server container as an administrator:
```bash
sudo docker compose -f /opt/priority-matrix/deploy/compose.yaml exec server node cli.js create-task-writer-key <account-name>
```
The command prints a key id and secret once. Store the secret in an approved secrets manager and provide it to the client through that manager's secure mechanism; never paste it into chat, a note, shell history, or a repository. Keep the id (not the secret) for revocation:
```bash
sudo docker compose -f /opt/priority-matrix/deploy/compose.yaml exec server node cli.js revoke-task-writer-key <account-name> <key-id>
```
The existing read-only key remains the read path. This API capability does not create a key or configure a client by itself.

### Existing label-writer keys

The legacy label-writer credential remains valid for label creation only. New Hermes profiles should use one task-writer key per profile for task and label changes; keep each profile's key separate so one profile can be revoked without disabling the other. Do not revoke a legacy label-writer key until the corresponding profile has switched to the task-writer key and its label-create workflow has been verified.

## Scoped label-writer API access (#11)

A label-writer key can create one new active label using the server's default free color. It cannot read account data, create or edit tasks, rename/recolor/archive/restore labels, administer accounts, or call other write routes. The endpoint checks the active name and label limit inside the account's serialized update. Label names already used by an active label are refused.

After deploying the code, create the key on the VPS:
```bash
sudo docker compose -f /opt/priority-matrix/deploy/compose.yaml exec server node cli.js create-label-writer-key <account-name>
```
The command prints a key id and secret once. Store the secret in the VPS's approved secret configuration for Hermes under `PRIORITY_MATRIX_LABEL_WRITER_KEY`; do not paste it into chat, a note, shell history, or a repository. Keep the id (not the secret) for revocation:
```bash
sudo docker compose -f /opt/priority-matrix/deploy/compose.yaml exec server node cli.js revoke-label-writer-key <account-name> <key-id>
```
The existing read-only key remains the lookup path. The key is not created or configured automatically by this code change.

## Switching to the public repo (once)
The code moved to the public repo `coldlight-labs/priority-matrix`, with a fresh history. Point the VPS at it and pull it once:
```bash
git -C /opt/priority-matrix remote set-url origin https://github.com/coldlight-labs/priority-matrix.git
/opt/priority-matrix/deploy/update.sh
```
Expect the usual check lines. `deploy/.env` and the data are untouched. Then remove the old deploy key: on the VPS `rm ~/.ssh/priority-matrix-deploy ~/.ssh/priority-matrix-deploy.pub` and delete the `Host github-pm` block from `~/.ssh/config`; on GitHub, the old private repo's Settings, Deploy keys, Delete.

## Moving to matrix.example.com (#71, once)
The first deploy served the app on the main domain. To move it:
1. In your DNS panel, add `matrix`: an `A` record to the VPS's IPv4 address (TTL 300). Tell Claude; Claude checks it is visible before the next step, because Caddy needs it to get the certificate.
2. On the VPS: `/opt/priority-matrix/deploy/update.sh`. Expect the usual check lines, now for `matrix.example.com`.
3. Open your link with `matrix.` added in front of the domain; the key after `#key=` stays the same. An old link still works for now: the main domain sends it on.
4. On each device that opened the old address, clear the website data for `example.com`, so the key no longer sits in the main domain's storage where a future site there could read it. Browsers list the domain and its subdomains together, so this also clears `matrix.`: open your new link again afterwards. Safari on iPhone: Settings, Apps, Safari, Advanced, Website Data, search for your domain, swipe to delete. Chrome on a computer: go to `chrome://settings/content/all`, search for your domain, delete its data.

## Updating and rolling back
- Update to the latest `main`: `/opt/priority-matrix/deploy/update.sh`
- Roll back to an earlier version: `/opt/priority-matrix/deploy/update.sh <commit>` (find commits with `git -C /opt/priority-matrix log --oneline`). Data is never touched by either.
- Logs: `sudo docker compose -f /opt/priority-matrix/deploy/compose.yaml logs --tail 50 server`
- Accounts: `sudo docker compose -f /opt/priority-matrix/deploy/compose.yaml exec server node cli.js list` (or `revoke <name>`).

## Sharing with testers
- `create <name>` on the VPS prints one link. New accounts start with Work, Home, Personal, Health and Money; `create owner --empty` makes the owner's account without them, ready for the import. Send it privately (a direct message, not a group or a post).
- The link is the key: anyone with it can use that account. If a link leaks, `revoke <name>`, then `create` a new one.
- Tell testers, in one short note: their tasks are stored on the owner's server, only they and the owner (as the host) can see them, and the owner deletes everything on request.

## Out of scope for now
- Custom domains per person, sign-in with passwords or Google, sharing one account between people.
- Moving testers' data between accounts.
- Monitoring and alerts beyond the server's own logs (revisit if more people use it).
