# Building for Apple: the rules we keep

Roger joined the Apple Developer Program as an individual in October 2026. That lets the Mac app be signed and
notarised, and later lets the iPhone app go out through TestFlight and the App Store. Joining means agreeing to
Apple's terms. This page lists what ThoughtKnot does to keep them, what is still missing, and what needs a lawyer.

**This is not legal advice.** It is a working list for building the apps. The questions at the end need a lawyer.

Apple's own pages are the source. Read them there, since Apple changes them:

- [Agreements and guidelines](https://developer.apple.com/support/terms/): the program agreement and the developer
  agreement.
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): what the App Store accepts.
- [Guidelines for using Apple trademarks](https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html).

## At a glance

| Area                     | The rule we keep                                                                | Now      |
| ------------------------ | ------------------------------------------------------------------------------- | -------- |
| Keys and accounts        | Keys stay Roger's, are kept safe, and never reach a pull request or another person | Met for the Mac; see below |
| What we say about Apple  | Signed and notarised; never a claim that Apple vouches for it; no Apple logo                     | Met, checked by a test |
| Licences and open source | MPL-2.0 code and CC-BY-4.0 spec text ship with their notices                       | Met; one lawyer question |
| Privacy                  | No data collected; a privacy page the app and store can link to                    | Gap: no privacy page yet |
| AI                       | Nothing goes to an AI model unless the person sets it up and presses Send          | Met in the plugin; the apps send nothing |
| Encryption and export    | Know which export rules apply before the iPhone app ships                          | Gap: needs a lawyer |
| The iPhone app           | Reaches the public only through TestFlight or the App Store                        | Gap: needs Roger's choice |
| Our name and the app id  | The app id sits under thoughtknot.app, so it never has to change                    | Met, checked by a test |
| Who signs up and submits | Roger, in person, from his own account                                             | Met |

The test `test/apple-terms.test.js` checks the rows marked "checked by a test". The rest are in the risk register,
`quality/risks.json`, as LEGAL-1 to LEGAL-4.

## Keys and accounts

The Mac app is signed with Roger's Developer ID certificate, then notarised. `docs/app-signing.md` has the steps.

- **Only Roger's builds get the keys.** A pull request build never sees them. A secret is set by Roger alone.
- **Keys go to no other person or company.** A tool may use them on Roger's behalf, but nobody else may sign with them.
- **A leaked key is reported at once.** Roger revokes it in his Apple account and tells Apple. Then a new one goes
  into the secrets.
- **App Store and TestFlight keys stay on Roger's Mac.** No workflow holds one. Roger uploads iPhone builds himself.
  A test fails if a workflow names such a key.
- **The Apple tools run on Apple computers only.** Mac builds run on macOS runners, which are Apple hardware. We never
  build the Mac app on Linux or Windows with copied Apple tools.
- **Notarising is better done with an App Store Connect API key** than with Roger's Apple Account and an app password.
  An API key can be limited and revoked on its own. Roger chooses which (LEGAL-4).

## What we say about Apple

Apple does not vouch for the apps, so we never say it does.

- Say "signed and notarised". Never claim Apple vouches for it, and never say "malware-free".
- Never use the Apple logo, an Apple product picture or Apple emoji in the app, the home page or a store listing.
- Name Apple products only to say where ThoughtKnot runs: "ThoughtKnot for Mac", "runs on iPhone".
- Make no public statement about our agreement with Apple. This page says what we do, not what the agreement says.
- `TRADEMARKS.md` says Apple's names belong to Apple.

## Licences and open source

- **Our code is MPL-2.0.** Anyone may get the source of each file we ship. Each release links to it.
- **Spec text is CC-BY-4.0.** It ships in no app, so it needs nothing more.
- **Each bundled library keeps its notice.** `THIRD_PARTY_NOTICES.md` lists them, and
  `test/licences.test.js` keeps GPL code out of all we ship.
- **No library may make Apple's own software open source.** We only link Apple's frameworks; we never copy them in.
- **The sign-off (DCO) shows each change may be shared** under our licences. So Roger can stand behind every file he
  submits to Apple.

## Privacy

The apps collect nothing. They make no network request, keep no account and run no analytics. Apple still needs a
privacy policy, linked from the store listing and from inside the app (LEGAL-2).

- The privacy page lives on thoughtknot.app. It is made from the "Privacy and network use" part of `README.md`.
- It says what is kept, where, for how long, and how to delete it. For ThoughtKnot that is the person's own notes on
  their own device.
- The App Store's privacy answers say "Data not collected". They change when a feature sends anything.
- If a data breach ever happens, people are told, as the law asks.

## AI

Only the Obsidian plugin can send text to an AI model today. The rules in `README.md` already match Apple's:

- Nothing is sent until the person sets up a model and presses Send. They see what goes, and to which address.
- The privacy page names AI models as a place text can go. It says the person chooses the model.
- If the iPhone or Mac app ever sends text to an AI model, it asks first, in the app, before the first send.

## Encryption and export

Notarising and the App Store both ask about encryption. The Mac app has none of its own. The iPhone app will keep
notes encrypted with keys in the iPhone's Keychain (`ios_app`), and sync may add more later (LEGAL-3).

- Use Apple's own encryption where possible. That keeps the export answer simplest.
- Before the first iPhone build goes to TestFlight, a lawyer confirms the export answer. They also say whether a
  report is due in the US or France.
- Then set `ITSAppUsesNonExemptEncryption` in the iPhone app to match that answer.

## The iPhone app

Apple allows three ways to put an app on other people's iPhones: the App Store, TestFlight, and ad hoc builds. Ad hoc
builds are only for people working with you, on a small number of listed devices. So the public gets the iPhone app
through TestFlight or the App Store (LEGAL-1).

- `ios_app` also names ad hoc builds, an install from Xcode and SideStore. Those suit Roger's own devices and testers.
- The App Store also asks that the app is sandboxed on the Mac, uses Apple's WebKit, and does more than show a website.
  The Tauri app already uses WebKit and works offline. The Mac App Store would need the sandbox.
- In the EU, the App Store asks whether the seller is a trader. If yes, it shows Roger's address and phone number.
  Decide this before the first App Store release.

## Our name and the app id

- The app id is `app.thoughtknot.desktop`, under thoughtknot.app, which Roger owns. The iPhone app uses the same form.
- The store listing uses the name ThoughtKnot and our own icon only. It copies no Apple app and no other app.

## Who signs up and submits

Roger is the member, as an individual. So:

- The Mac app shows his own name as its maker. To show a company name later, he joins as an organisation.
- Roger is personally responsible to Apple for the apps. A company could carry that instead; ask a lawyer.
- Only Roger submits to the App Store and TestFlight. No other person or service does it for him.
- His account details stay true and up to date, and his Apple Account password is shared with nobody.

## Questions for a lawyer

Take these to a lawyer who knows software and export rules before the first App Store release:

1. Does the MPL-2.0 sit well with Apple's standard end-user licence on the App Store? We think yes, but confirm it.
2. Which export rules apply to the iPhone app's encryption, and is a US or French report due?
3. Should Roger keep the membership as an individual, or move it to a company to limit personal liability?
4. Is Roger a trader under the EU's Digital Services Act for a free app?
5. Does signing in GitHub Actions with the Developer ID certificate count as handing it to a service provider?
