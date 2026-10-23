# Signing the apps

A signature tells a computer who made an app and that nobody changed it since. Without one, macOS and Windows warn
people the first time they open ThoughtKnot. This page says what each system needs, what it costs, and the steps only
Roger can do: accounts, certificates and repository secrets.

CI is ready now. Each system signs as soon as all its secrets are set. Until then it builds unsigned, as before. A
secret that is only half set never breaks a build: the run builds unsigned and warns, naming what is missing.

## At a glance

| What                  | What it gives people                          | Cost                 | Roger's time | Status                 |
| --------------------- | --------------------------------------------- | -------------------- | ------------ | ---------------------- |
| macOS                 | Opens with no warning (signed and notarised)  | $99 a year (Apple)   | About 1 hour | Paused (Roger, 23 Oct 2026) |
| Linux `.deb`          | A `.asc` signature people can check           | Free                 | 10 minutes   | Signed (23 Oct 2026)   |
| App updater key       | Updates people can trust, once the app has them | Free               | 5 minutes    | Made, used later       |
| Windows               | Opens with no SmartScreen warning             | From free to ~$10 a month | -       | Unsigned (Roger, 23 Oct 2026) |
| iPhone                | Install through TestFlight                    | Same Apple membership | Later       | Later                  |

## How it works

- `.github/workflows/desktop-app.yml` builds the installers on each system with `scripts/desktop-build.mjs`.
- On a pull request it never gets the secrets. A pull request's code could read them, so it builds unsigned.
- On a push to main, or when started by hand, it passes the secrets to the build.
- The installers are kept as downloads of the run. The run's summary says, per system, whether it signed.
- The release workflow does not ship the desktop installers yet. That is the next step for the desktop app.

## Adding a secret

Every secret below is added the same way: with the GitHub command line, on Roger's Mac. The value never shows on
screen and never goes into a file in the repository.

```sh
cd ~/Dev/thoughtknot && gh secret set NAME            # it asks for the value; paste it and press Enter
cd ~/Dev/thoughtknot && gh secret set NAME < ~/path/to/file   # or read the value from a file
```

To see which are set (names only, never values): `cd ~/Dev/thoughtknot && gh secret list`.

Or in Chrome: github.com/rogerbucks/thoughtknot, then Settings, then "Secrets and variables", then Actions, then
"New repository secret".

## macOS: sign and notarise

Apple must know who made the app (signing), and must scan it (notarising). Then a Mac opens it with no warning.

### 1. Join the Apple Developer Program

1. In Chrome, open https://developer.apple.com/programs/enroll/ and sign in with your Apple Account.
2. Enrol as an individual. It costs $99 a year (about £79 in the UK). The app then shows your legal name as its maker.
   To show a company name, you enrol as an organisation instead, which needs a D-U-N-S number.
3. Wait for the email that says you are in. It often takes a day or two.

The same membership covers the iPhone app later.

### 2. Make a Developer ID certificate

1. On your Mac, open Xcode, then Settings, then Accounts. Add your Apple Account if it is not there.
2. Choose your team, then "Manage Certificates…". Press `+` and choose "Developer ID Application".
3. Open Keychain Access. Under "My Certificates", find "Developer ID Application: …". Right-click it and choose
   Export. Save it as `~/Desktop/thoughtknot-developer-id.p12` and give it a strong password.

### 3. Get the other values

- Its name, for `APPLE_SIGNING_IDENTITY`: run `security find-identity -v -p codesigning` and copy the text in quotes,
  such as `Developer ID Application: Your Legal Name (AB12CD34EF)`.
### 4. Make an API key for notarising

Apple notarises with an App Store Connect API key, not your Apple ID and password (Roger, 23 Oct 2026; LEGAL-4). The
key can only notarise and manage builds, and you can revoke it on its own.

1. In Chrome, open https://appstoreconnect.apple.com and sign in.
2. Choose "Users and Access", then "Integrations", then "App Store Connect API". Under "Team Keys", press `+`.
3. Name it "ThoughtKnot notarising" and give it the "Developer" access. Press Generate.
4. Copy the **Issuer ID** at the top of the page, for `APPLE_API_ISSUER`.
5. Copy the key's **Key ID**, for `APPLE_API_KEY`.
6. Press "Download API Key". It saves `AuthKey_<Key ID>.p8` in Downloads. Apple lets you download it **once only**.

### 5. Add the six secrets

```sh
cd ~/Dev/thoughtknot && base64 -i ~/Desktop/thoughtknot-developer-id.p12 | gh secret set APPLE_CERTIFICATE
cd ~/Dev/thoughtknot && gh secret set APPLE_CERTIFICATE_PASSWORD   # the .p12 password from step 2
cd ~/Dev/thoughtknot && gh secret set APPLE_SIGNING_IDENTITY       # the name from step 3
cd ~/Dev/thoughtknot && gh secret set APPLE_API_ISSUER             # the Issuer ID from step 4
cd ~/Dev/thoughtknot && gh secret set APPLE_API_KEY                # the Key ID from step 4
cd ~/Dev/thoughtknot && gh secret set APPLE_API_PRIVATE_KEY < ~/Downloads/AuthKey_*.p8
rm ~/Desktop/thoughtknot-developer-id.p12 ~/Downloads/AuthKey_*.p8
```

Keep a copy of the `.p12`, its password and the `.p8` file in your password manager first. Then delete the files.

## Linux: a GPG signature beside the `.deb`

Linux has no warning to remove. A signature lets people check that the `.deb` came from ThoughtKnot. It is free.

```sh
gpg --quick-gen-key "ThoughtKnot releases <you@example.com>" ed25519 sign 3y
gpg --armor --export-secret-keys you@example.com > ~/Desktop/thoughtknot-linux.key
cd ~/Dev/thoughtknot && gh secret set LINUX_GPG_PRIVATE_KEY < ~/Desktop/thoughtknot-linux.key
cd ~/Dev/thoughtknot && gh secret set LINUX_GPG_PASSPHRASE         # the passphrase gpg asked you for
gpg --armor --export you@example.com > ~/Desktop/thoughtknot-linux-public.asc
rm ~/Desktop/thoughtknot-linux.key
```

If `gpg` is missing, install it first: `brew install gnupg`. Put an email address you own in place of
`you@example.com`.

The public key is safe to share. Send it in the project, and a thread will publish it so people can check the
signature. Keep the private key and its passphrase in your password manager.

### Check a Linux download

The public key is in [`keys/thoughtknot-linux.asc`](../keys/thoughtknot-linux.asc). Its fingerprint is:

```text
4EA9 AE6F 55A4 6A4A E1CC  9497 F7DF 7FDB EE80 9A70
```

Download the `.deb` and its `.deb.asc` into one folder. Then:

```sh
gpg --import keys/thoughtknot-linux.asc
gpg --verify ThoughtKnot_*.deb.asc ThoughtKnot_*.deb
```

It should say "Good signature from ThoughtKnot releases". Check that the fingerprint it shows matches the one above.

## The app updater key

The app has no in-app updater yet. When it does, each update must carry a signature made with this key, or the app
refuses it. Make it now, so the updater can use it from day one.

```sh
cd ~/Dev/thoughtknot/packages/app && npx --yes @tauri-apps/cli@2.12.4 signer generate -w ~/.tauri/thoughtknot.key
cd ~/Dev/thoughtknot && gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/thoughtknot.key
cd ~/Dev/thoughtknot && gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD   # the password it asked you for
```

Keep `~/.tauri/thoughtknot.key` and its password in your password manager. If this key is lost, installed apps can
never take another update, and everyone has to reinstall by hand. The public key, `~/.tauri/thoughtknot.key.pub`, goes
into the app with the updater.

## Check that it worked

```sh
cd ~/Dev/thoughtknot && gh workflow run desktop-app.yml --ref main
```

When the run ends, open it on GitHub. Its summary says, per system, `macOS: yes, notarise: yes` or `Linux: yes`. A
yellow warning names any secret still missing.

## Windows: later

Roger chose to leave Windows unsigned for now (23 Oct 2026). Windows shows a blue SmartScreen box, and people choose
"More info", then "Run anyway". The ways to sign it later:

| Way                        | Cost           | Who can use it                                                | Wait               |
| -------------------------- | -------------- | ------------------------------------------------------------- | ------------------ |
| Azure Artifact Signing     | About $10 a month | A registered company (UK, EU, US and more), or a person in the US or Canada | 1–20 working days |
| SignPath Foundation        | Free           | Open-source projects it approves                              | Weeks              |
| Microsoft Store            | Free           | Anyone; the Store signs it, but people install from the Store | Days               |
| A bought certificate (cloud key) | About $200–400 a year | Anyone, after an identity check                   | Days               |

Each needs a small change to `scripts/desktop-build.mjs`, and the secrets for that way.

## iPhone: later

The iPhone app (spec `ios_app`) uses the same Apple membership. It needs an Apple Distribution certificate and a
provisioning profile, and goes out through TestFlight. Those steps come with the iPhone app itself.

## Risks

- The keys are in the build step's environment on main. Any crate's build script that runs in that step could read
  them. The crates are pinned in `Cargo.lock`, and the dependency review checks each change to them.
- A pull request never gets the keys. `test/desktop-build.test.js` holds that.
