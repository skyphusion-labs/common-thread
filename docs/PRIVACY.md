# Privacy (hosted instance)

> **Status: DRAFT revision for review (#318).** It replaces the v0.1.2 disclosure, which left out
> or misstated several things the code does. It is a plain description of what the hosted
> instance does with data, written to be checked against the source.

> **Not legal advice, and not a compliance certification.** Written by Ernst (Conrad's
> legal-affairs helper, who is named after a lawyer and is not one). It does not certify
> compliance with GDPR, CCPA/CPRA or any other law. Sections marked **COUNSEL** need a licensed
> lawyer. Sections marked **DECISION** wait on a call that is Conrad's alone.

## The short version

We do not want your data. **Self-host and we never see any of it**; that is the option we prefer.

The hosted instance is different, and we will not pretend otherwise: here we are in the data
path. We hold the investigation material you upload, what is derived from it, and the results.
That is material about real accounts, and sometimes about real people. This page says exactly
what we hold, what is encrypted and what is not, and what we cannot delete.

## Scope

This covers **only the hosted instance** at
[common-thread.skyphusion.org](https://common-thread.skyphusion.org) (API:
`common-thread-backend.skyphusion.org`). If you self-host, none of it applies: you run your own
instance and set your own posture. The AGPL-3.0 governs the code, not your data handling.

## 1. Who operates this

> **DECISION (Conrad, #318 section 8 item 1):** the legal name of the operator.

Contact: `common-thread@skyphusion.org`. See [contact.md](contact.md).

## 2. Two groups of people

1. **You, the visitor.** You create investigations, bring credentials and read results.
2. **The people behind the accounts in your data.** They did not give us anything and were not
   asked. Section 9 is written to them.

## 3. What we hold about you

Very little, by design.

| What | Detail |
|---|---|
| Account, name, email | **None.** There are no accounts. |
| Cookies, analytics, trackers | **None.** The UI loads nothing from third parties. |
| Access token | Only a SHA-256 hash. We cannot recover the token. |
| Your IP address | Used as a rate-limit key when you create an investigation, kept in the edge cache for the length of the window (10 minutes by default), then it expires. |
| Request logs | Our infrastructure provider keeps request logs (time, route, status, IP as seen at the edge). Job logs record job and investigation ids. |
| AI credentials | **Never stored.** Read from the request, used, dropped. |
| Practitioner name on a packet | Rendered into the packet you download. Not stored. |

In **your browser**, not on our servers: the UI keeps your access tokens in `localStorage`, and
your AI credentials too if you tick "remember". Both are unencrypted on your device.

> **DECISION:** the retention window for request logs. Open since the v0.1.2 disclosure.

## 4. What we hold about the accounts in your data

This is the part the earlier disclosure understated.

**It is wider than the accounts you meant to look at.** On Twitter/X ingest, every author present
in the export is registered as a seed account. Follower and following lists, and the accounts a
seed replied to or mentioned, are stored as well.

**It includes things that can identify a person.** The methodology's *output* names accounts by
handle and clusters by an opaque id, and never names a person. Its *inputs* are another matter:

| Data | Stored as |
|---|---|
| The export you upload, and per-account timelines with the full post objects, including quoted and reposted third-party posts | Archive |
| Profile: display name, username, platform id, bio, stated location | Archive and database |
| Coordinates looked up from the stated location (offline city table; nothing is sent to a geocoder) | Database |
| Image metadata (EXIF): camera make and model, lens, software, timestamps, and **GPS latitude, longitude and altitude** where an image carries them | Archive and database |
| Image URLs and hashes of posted, profile and banner images. The image bytes are not kept. | Archive |
| Follower and following lists; reply and mention targets | Archive and database |
| Client app and language distributions | Database |
| Your basis statements: your own prose about why an account is in the set | Database |

> **DECISION (Conrad, #318 section 8 item 2):** whether the hosted instance keeps extracting EXIF
> GPS, storing follower lists, and registering every author in an upload. Privacy ranks above
> feature completeness here, so each is a keep-and-disclose or a drop. This section describes the
> code as it is today.

## 5. What we derive

From the data above the system computes behavioral features, and it is plain profiling: posting
hours by hour and by weekday, quiet periods and bursts, writing-style measures, shared links and
images, device and client fingerprints, and location distance between accounts. These are
compared across pairs of accounts, and a language model reasons over the comparison to produce
a confidence band.

Posting-time patterns say something about a person's timezone and daily routine. We say so
because the code's own comments do.

## 6. What is encrypted, and what is not

New investigations are encrypted **in part**. The key is derived from your access token and is
never stored, so we cannot read the encrypted part, and neither can anyone who copies the
database.

| Encrypted in the database | **Not encrypted** |
|---|---|
| Feature values | Investigation id, name and description |
| Event data (including reply and mention targets) | Account handles and platforms |
| Your basis statements and removal reasons | Confidence band per pair |
| Attribution output and summary | All timestamps, counts, feature names |
| Investigation metadata | Job records, including error text |
| | **Everything in the archive**: uploads, timelines, profiles, image metadata, follower lists, and the manifest |

So a copy of the database shows **which accounts were examined, when, and with what result
band**, but not the reasoning. A copy of the archive shows the collected material in full.

Two more limits. The key leaves the Worker, sealed, when work is handed to our own containers,
and exists in their memory for the length of the job. And investigations created before
encryption shipped, if any remain, are not encrypted at all.

## 7. Where the data goes

| Where | What |
|---|---|
| **Cloudflare** | Runs the Workers, the archive (R2) and the database connection, and keeps request logs. |
| **Our server host** | Runs the database and the ingest, PDF and attribution containers. The PDF container handles a fully decrypted evidence packet while it renders it. |
| **The AI gateway you name, and the model provider behind it** | When you run attribution: the investigation id, handles and platforms, your basis statements, control accounts, time bounds, and the full signal table. |
| **The platform's image CDN** | On Twitter/X ingest, **our** servers fetch the images referenced in your upload in order to hash them. The CDN sees our address, not yours. |

We do not sell data, share it for advertising, or send it to data brokers. There is no email,
webhook or analytics call anywhere in the code.

> **DECISION (Conrad, #318 section 8 item 4):** name the server host and its region here, and
> state whether provider snapshots are enabled. `[CONFIRM: provider and region]`

## 8. Retention and deletion

**Nothing expires on its own.** There is no scheduled purge.

| Action | What happens |
|---|---|
| Remove a seed | It is marked removed. The row stays. |
| Seal an investigation | It becomes read-only, permanently. **It can no longer be deleted**, and there is no unseal. |
| Delete an active investigation (needs your token) | Its database rows are deleted, and its manifest and signature log are deleted from the archive. |
| Archived artifacts | **Never deleted by any code path.** They are stored by content hash and shared across investigations, so identical bytes are kept once. |
| Lose your token | The encrypted content is unreadable for good. The unencrypted rows and the archived artifacts stay, and you can no longer delete them. |

Two consequences we would rather state than have you discover:

- **Deleting an investigation removes the index, not the material.** The manifest is the only
  record of which artifacts belonged to which investigation. Once it is gone, the artifacts
  remain and we can no longer tell whose they were.
- **Backups are copies that deletion does not reach**: any backup of the database or the
  archive, and any snapshot of the server.

**Do not upload anything you need to be erasable.**

> **DECISION (Conrad, #318 section 8 item 3):** a fixed retention window, and whether unreferenced
> artifacts should be collected.

## 9. If an account of yours is in someone's investigation

You did not choose to be here, and you are owed a straight answer about what we can do.

- **Write to** `common-thread@skyphusion.org`.
- **What we can do:** search the unencrypted records for a handle and tell you whether it
  appears.
- **What we cannot do:** read the encrypted content of any investigation, tell you who created
  it (we do not know), or reliably find archived artifacts once the investigation that pointed to
  them has been deleted.
- **If you are a member of a group this tool must never be pointed at**, see
  [ACCEPTABLE-USE.md](ACCEPTABLE-USE.md) and report it with the subject prefix `[ABUSE]`.

> **COUNSEL (#318 section 9 items 1 to 4):** what rights you have in law, and what we are obliged
> to do about them, depends on questions we have not had answered. We will not promise a legal
> right we have not confirmed we can honour.

## 10. Our role, and the legal basis

> **COUNSEL (#318 section 9 items 1 to 3).** The earlier disclosure described the visitor as the
> controller and the host as a processor. **That framing is withdrawn pending advice.** The host
> decides which features are derived, how long data is kept and what cannot be deleted; it shares
> artifacts across investigations; and it fetches images itself. Those are not the acts of a party
> that only follows instructions. Whether the host is a controller, a joint controller or a
> processor, and on what legal basis, is for counsel.

## 11. Security and breach

Access is by capability token, compared in constant time. Investigations cannot be listed. The
containers are reachable only over a private network. See
[ENCRYPTION-AT-REST.md](ENCRYPTION-AT-REST.md) for the threat model, including what it does not
protect against.

> **COUNSEL:** breach notification duties. We have no contact details for visitors, which limits
> who we could notify.

## 12. Legal process

See [TERMS.md](TERMS.md) section 14 for what we could and could not produce.

## 13. Children

> **DECISION / COUNSEL:** the minimum age for visitors.

Investigating an account run by a minor is prohibited, and meeting one is a stop condition
([ACCEPTABLE-USE.md](ACCEPTABLE-USE.md)). There is no technical gate behind that rule. It depends
on you.

## 14. The one exception to hands-off

We do not monitor what visitors do. The product-wide
[privacy commitment](PRIVACY-COMMITMENT.md) states the single bright-line exception to that, and
it applies here.

## 15. Changes

This document is versioned in this repository. The git history of this file is the change log,
and it is public.

---

**Status:** DRAFT revision for review (#318). Where this document and the code disagree, the code
is what actually happens, and the document is the defect.
