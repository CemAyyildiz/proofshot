# Security policy

## Reporting a vulnerability

Please report security issues privately, not in a public issue:

1. Open the repository's **Security** tab and choose **Report a vulnerability**
   ([direct link](https://github.com/CemAyyildiz/proofshot/security/advisories/new)).
2. Say what you found, how to reproduce it, and what an attacker could do with it.

Every report is read. Please give us a reasonable time to fix the issue before disclosing it.

## What is in scope

- The Registry contract on Monad mainnet,
  [`0xa6989c9f93d70526c1b982a5A408DF240575E433`](https://monadvision.com/address/0xa6989c9f93d70526c1b982a5A408DF240575E433).
- The live app at https://proofshot.lykan.website and the code in this repository.

Examples of what we most want to hear about: a Seal recorded without a valid passkey signature, a way to make the
verifier return a wrong Verdict, one insurer reading another insurer's photos or claims, or a way to spend the
relayer's funds beyond the documented limits.

## What is already known

The limits of what a Seal proves are documented, not hidden: see the [threat model](docs/threat-model.md). In
particular, a Seal does not prove that the pixels came from the camera sensor. Roles, trust assumptions and the test
behind each contract guarantee are in [docs/security.md](docs/security.md).

Please do not run load or denial-of-service tests against the live app, and do not put real personal data into the
shared demo workspaces.
