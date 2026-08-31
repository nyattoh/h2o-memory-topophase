# Security Policy

## Supported version

The `v0.1.0-alpha` line is an experimental reference prototype. It has no production-support or security-maintenance guarantee.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue.

After the public GitHub repository is created, use its private vulnerability-reporting form under **Security > Advisories > Report a vulnerability**. Until that channel exists, this local release candidate does not accept external security reports.

Do not include API keys, access tokens, raw personal dialogue, personal identifiers, or confidential research data in a report or test case.

## Scope

Security-relevant reports include:

- consent withdrawal or deletion that fails to invalidate a derived view;
- restoration that revives rejected or corrected information;
- provenance or audit history that can be forged or silently removed;
- an operation failure that leaves partially mutated canonical state;
- unsafe deserialisation or path handling added in a later persistent implementation.

This prototype is in-memory and has no authentication, authorisation, network server, multi-user isolation, durable storage, or encryption layer. It must not be deployed as a production service.
