# Terms of Service (hosted instance)

> **Status: DRAFT for review. NOT IN FORCE.** Nothing here binds anyone until Conrad puts it in
> force and the hosted UI links it. Tracked on
> [#318](https://github.com/skyphusion-labs/common-thread/issues/318).

> **Not legal advice.** Written by Ernst (Conrad's legal-affairs helper, who is named after a lawyer
> and is not one). Sections marked **COUNSEL** are left empty on purpose: they need a licensed
> lawyer, and a guess in their place would be worse than a gap. Sections marked **DECISION** wait
> on a call that is Conrad's alone.

These terms cover **only the hosted instance** at
[common-thread.skyphusion.org](https://common-thread.skyphusion.org). If you self-host, none of
this applies to you: you run your own instance under the AGPL-3.0 and you set your own terms.
Self-hosting is the option we prefer, and it is the one where we never see your data.

## 1. Who operates this

> **DECISION (Conrad, #318 section 8 item 1):** the legal name of the operator, and whether
> Skyphusion Labs is an entity or a name Conrad operates under. Everything in these terms that
> says "we" means that operator.

Contact: `common-thread@skyphusion.org`. See [contact.md](contact.md).

## 2. What the service is, and what it is not

Common Thread looks at public behavioral signals from a set of accounts you supply and reports
whether the evidence is consistent with those accounts sharing an operator. It reports one of
three bands: `insufficient`, `consistent`, or `strongly_consistent`.

- It does **not** identify a person. It stops at a cluster of accounts, by design (paper section
  3.3.3).
- It does **not** produce a verdict. "Strongly consistent" is not "proven" (paper section 3.2.2).
- It is **not** legal advice, an investigation service, or an expert report. We do not run
  investigations for anyone (see [contact.md](contact.md)).

## 3. Who may use it

There are no accounts. You do not give us a name or an email address.

> **DECISION / COUNSEL:** the minimum age for visitors. You bring your own AI provider
> credentials (section 5), so you must at least meet the age your provider requires of its own
> customers.

## 4. Your access token

Creating an investigation returns one access token, once.

- The token is the only credential. **Anyone who holds it can read the investigation, and can
  change or delete it while it is active.**
- We store only a SHA-256 hash of it. **We cannot recover it, reset it, or look it up.**
- The token is also the only key to the encrypted part of your investigation (see
  [PRIVACY.md](PRIVACY.md)). Lose it and that content is unreadable for good, by you and by us.
  We accept that cost because it is what makes the promise true: a host that could restore your
  access would be a host that could read your work.
- A share link carries the token. Sharing the link shares full access.
- The web UI keeps tokens in your browser's `localStorage`, unencrypted, on your device. Do not
  use a shared machine for sensitive work.

## 5. You bring your own AI credentials

Attribution runs on **your** AI provider account, through a gateway URL and a credential you
supply.

- The model calls are billed to you by your provider, under your provider's terms. We are not a
  party to that contract.
- We do not store your credential. It is read from the request, used for that request, and
  dropped.
- When you run attribution, the investigation id, the account handles, your basis statements, any
  control accounts, the time bounds and the full signal table are sent to the gateway you named,
  and from there to the model provider. You are choosing to send that data to them.

## 6. What you are responsible for

You decide which accounts to look at, you collect the data, and you upload it. So:

- You are responsible for having the right to hold and process what you upload, including under
  the terms of the platform it came from. The paper's position on scraping (section 10.4) is an
  ethical argument for specific contexts. It is not a legal defence and it does not transfer to
  you.
- You are responsible to the people in the data. **An upload usually contains more accounts than
  the ones you meant to look at**: on Twitter/X ingest every author present in the export is
  registered, and follower lists and reply targets bring in more.
- You are responsible for what you do with the output, including anything you publish or file.

## 7. Acceptable use

[ACCEPTABLE-USE.md](ACCEPTABLE-USE.md) is part of these terms. It names the people this tool must
never be pointed at, including a categorical exclusion of minors, and the uses we prohibit. Read
it before you start.

## 8. What we may do

We state only the levers that exist.

- We may rate-limit or refuse requests.
- We may decline to support a use and say so publicly (paper section 10.8).
- We may reduce or retire the hosted instance (section 11).

We cannot inspect your intent, and we do not monitor what you do with the tool. Not acting in a
given case is not approval.

> **Open, tracked on [#315](https://github.com/skyphusion-labs/common-thread/issues/315) item 4:**
> [ACCEPTABLE-USE.md](ACCEPTABLE-USE.md) says we will revoke an investigation's token on a
> credible report. No such mechanism exists in the code today. These terms do not promise it.

## 9. Outputs

Outputs are probabilistic, are written in part by a language model, and can be wrong. The
methodology declines rather than guesses, and a declination is a result, not a failure.

Talk to a lawyer before you rely on an output in a court filing. The methodology produces
cluster-level claims; admissibility is your responsibility (paper section 3.2.3).

## 10. Retention and deletion

[PRIVACY.md](PRIVACY.md) has the detail. The short version:

- Nothing expires on its own.
- You can delete an **active** investigation with your token. That removes its database rows and
  its manifest.
- Deleting does **not** remove the archived artifacts themselves. They are stored by content hash
  and shared across investigations.
- A **sealed** investigation cannot be deleted or unsealed. Seal only when you mean it.

> **DECISION (Conrad, #318 section 8 item 3):** whether the hosted instance adopts a fixed
> retention window.

## 11. Availability

The hosted instance is offered as a public good, free of charge, on a best-effort basis during a
bounded maintenance window ([MAINTENANCE.md](MAINTENANCE.md)). It may be slow, unavailable,
reduced or retired. Keep your own copies of anything you need: download your evidence packets.

## 12. The API

The web UI is open. The HTTP API behind it is not a supported integration surface for third-party
applications. Use the UI, self-host, or contact us first.

> **DECISION (Conrad):** this states the current default
> ([API-OPENNESS-DECISION.md](API-OPENNESS-DECISION.md), option 1), which is still marked pending.

## 13. Reports and complaints

Report misuse to `common-thread@skyphusion.org` with the subject prefix `[ABUSE]`, and security
issues with `[SECURITY]`. Do not send documents about the accounts involved; describe the concern
([contact.md](contact.md)).

> **COUNSEL (#318 section 9 item 9):** copyright complaints. The instance stores copies of
> third-party posts. Whether to register a designated agent, and the notice procedure, are for
> counsel.

## 14. Legal process

If we are served with valid legal process, this is what we could and could not produce:

- **We hold in readable form:** investigation ids, names and descriptions; the handles and
  platforms of the accounts in an investigation; confidence bands; timestamps; and the archived
  artifacts.
- **We cannot produce:** the encrypted content of an investigation (features, basis statements,
  attribution output). We do not hold the key.
- **We do not know who you are.** There is no account, name or email on file, so we have nobody
  to notify.

> **COUNSEL (#318 section 9 item 10):** our stance on challenging, narrowing and giving notice of
> legal process.

## 15. Warranty and liability

> **COUNSEL (#318 section 9 item 8).** Left empty on purpose. The AGPL-3.0 disclaims warranty and
> liability for the **software**. It says nothing about the **service**, and nothing here should
> be read as filling that gap until counsel writes it.

## 16. Indemnity

> **COUNSEL (#318 section 9 item 8):** whether a free public-good service should ask for one at
> all.

## 17. Governing law and venue

> **COUNSEL (#318 section 9 item 8),** following the answer to section 1.

## 18. Changes

These terms are versioned in this repository. The git history of this file is the change log, and
it is public.

## 19. Licenses

The code is AGPL-3.0-only ([LICENSE](../LICENSE)). The methodology paper is CC-BY-4.0
([paper/LICENSE](../paper/LICENSE)). See [NOTICE](../NOTICE). Using the hosted instance gives you
no rights in the code or the paper beyond what those licenses already give everyone.

---

**Status:** DRAFT for review, not in force (#318). Where this document and the code disagree, the
code is what actually happens, and the document is the defect.
