# Security Policy

## Overview

Security is a core priority at **Growlancer**.

Growlancer handles user accounts, identity verification, project data, contracts, workspaces, payments, withdrawals, notifications, and other sensitive information. We take the security of the platform, its users, and its infrastructure seriously.

We appreciate responsible security research and encourage security researchers, developers, and users to report vulnerabilities privately so they can be investigated and addressed appropriately.

---

## Supported Versions

Growlancer actively supports the current production version and the primary development branch with security updates.

| Version / Branch             | Security Support   |
| ---------------------------- | ------------------ |
| `main`                       | :white_check_mark: |
| Current Production Release   | :white_check_mark: |
| Previous Production Release  | :warning: Limited  |
| Older / Unsupported Releases | :x:                |

Security support for older releases may be discontinued as the platform evolves.

For critical vulnerabilities, maintainers may provide security fixes outside the normal release cycle.

---

# Reporting a Vulnerability

Please **do not report security vulnerabilities through public GitHub Issues, Pull Requests, Discussions, or other public channels**.

Public disclosure before a vulnerability has been investigated and remediated may expose Growlancer users and systems to unnecessary risk.

### Preferred Reporting Method

Report security vulnerabilities privately through the repository's **GitHub Security Advisory** mechanism:

**GitHub → Security → Advisories → Report a vulnerability**

This allows the Growlancer maintainers to review and coordinate remediation securely.

When submitting a report, please provide as much of the following information as possible:

* A clear description of the vulnerability.
* The affected feature, endpoint, component, or service.
* Steps required to reproduce the issue.
* A proof of concept, where applicable.
* The potential security impact.
* The conditions required to exploit the vulnerability.
* Relevant logs, screenshots, request/response examples, or code references.
* A suggested mitigation or remediation approach, if known.

Please avoid including real users' personal information, authentication credentials, payment information, API keys, or other sensitive data in your report.

---

# What to Report

Security reports are particularly valuable for issues involving:

### Authentication & Authorization

* Authentication bypass
* Session hijacking
* Privilege escalation
* Account takeover
* Broken access control
* Role or permission bypass

### Data Security

* Unauthorized access to private user data
* Personal information exposure
* Database exposure
* Row Level Security bypass
* Insecure file or storage access
* Sensitive information leakage

### Marketplace Workflows

* Unauthorized project access
* Proposal or invitation manipulation
* Contract manipulation
* Workspace access bypass
* Milestone authorization issues

### Payments & Financial Systems

* Payment manipulation
* Escrow manipulation
* Withdrawal or payout abuse
* Duplicate payment processing
* Webhook verification bypass
* Platform fee manipulation
* Unauthorized financial operations

### Application & Infrastructure Security

* SQL injection
* Cross-site scripting (XSS)
* Cross-site request forgery (CSRF)
* Server-side request forgery (SSRF)
* Remote code execution
* Command injection
* Insecure API endpoints
* Dependency vulnerabilities
* Misconfigured cloud resources
* Secret or credential exposure

### Abuse & Integrity

* Fraud-enabling vulnerabilities
* Rate-limit bypass
* Automated abuse that bypasses platform protections
* Security issues affecting KYC or verification workflows

---

# Response Timeline

Growlancer aims to acknowledge valid security reports as follows:

| Stage                      | Target                              |
| -------------------------- | ----------------------------------- |
| Initial acknowledgement    | Within 3 business days              |
| Initial assessment         | Within 7 business days              |
| Severity classification    | As part of the assessment           |
| Remediation planning       | Based on severity and complexity    |
| Resolution / status update | Communicated throughout the process |

These timelines are targets rather than guaranteed deadlines. Complex vulnerabilities may require additional investigation, testing, or coordination.

---

# Vulnerability Assessment

Each submitted vulnerability will be evaluated based on factors including:

* Security impact
* Exploitability
* Required privileges or user interaction
* Scope of affected systems
* Potential exposure of user or financial data
* Availability and integrity impact
* Whether the issue affects production systems

The severity assigned by the Growlancer security or engineering team may differ from the researcher's initial assessment.

---

# What Happens After a Report

After receiving a vulnerability report, the Growlancer maintainers will generally:

1. Acknowledge receipt of the report.
2. Validate and reproduce the reported behavior.
3. Assess the security impact and affected components.
4. Determine the appropriate remediation strategy.
5. Develop and test a fix where applicable.
6. Deploy the remediation through the appropriate release process.
7. Communicate the resolution or status to the reporter where appropriate.

When necessary, additional information may be requested from the researcher during investigation.

---

# Accepted Reports

For confirmed vulnerabilities, Growlancer may:

* Develop and deploy a security fix.
* Apply temporary mitigations.
* Rotate or revoke exposed credentials.
* Restrict affected functionality.
* Review related systems for similar issues.
* Add automated tests to prevent regression.
* Update security controls or monitoring.
* Publish a security advisory when appropriate.

Security fixes may be prioritized according to severity, exploitability, affected users, and operational risk.

---

# Reports That May Not Qualify

The following generally do not qualify as security vulnerabilities unless they demonstrate a meaningful security impact:

* Missing security headers without an exploitable impact.
* Self-XSS that cannot affect another user.
* Social engineering attacks against Growlancer employees or users.
* Spam or content moderation issues without a security impact.
* Denial-of-service testing against production infrastructure without prior authorization.
* Automated scanning that creates significant traffic or service disruption.
* Vulnerabilities in third-party services that are outside Growlancer's control.
* Reports relying entirely on outdated or unsupported software versions where the issue is already addressed in supported versions.

Reports are evaluated individually.

---

# Responsible Disclosure

Growlancer requests that security researchers:

* Act in good faith.
* Avoid accessing, modifying, deleting, or exposing other users' data.
* Avoid disrupting production services.
* Avoid destructive testing.
* Avoid performing actions that could negatively affect platform users.
* Stop testing once sufficient evidence has been obtained.
* Keep vulnerability details confidential until remediation or coordinated disclosure has been agreed upon.

Do not use a discovered vulnerability to obtain financial benefit, access private accounts, or compromise third-party systems.

---

# Testing Guidelines

When demonstrating a vulnerability, use the minimum level of testing necessary to prove the issue.

Where possible:

* Use your own account.
* Use test projects or test data.
* Avoid real payment transactions.
* Avoid accessing another user's private information.
* Do not intentionally degrade production performance.
* Do not delete or modify data that does not belong to you.

For vulnerabilities involving payment, KYC, authentication, or financial workflows, provide a safe proof of concept rather than attempting destructive exploitation.

---

# Security Disclosure

Growlancer may coordinate public disclosure of confirmed vulnerabilities with the reporter.

A public security advisory may include:

* Vulnerability description
* Affected versions
* Severity
* Impact
* Remediation details
* Credits to the reporting researcher, where appropriate

Sensitive exploitation details will not be disclosed unnecessarily.

Researchers who would like to remain anonymous should state this clearly in their report.

---

# Security Best Practices for Contributors

All Growlancer contributors are expected to:

* Never commit secrets or credentials.
* Never expose Supabase service-role keys to client-side code.
* Validate authorization on trusted server-side boundaries.
* Follow Row Level Security requirements.
* Validate payment webhooks securely.
* Treat financial operations as security-sensitive.
* Validate and sanitize untrusted input.
* Use parameterized database queries.
* Keep dependencies reasonably up to date.
* Avoid logging credentials, tokens, payment details, or sensitive personal information.
* Follow least-privilege principles.
* Add regression tests for security fixes where appropriate.

---

# Dependency & Supply Chain Security

Dependencies are part of Growlancer's security posture.

Contributors should:

* Avoid unnecessary dependencies.
* Prefer maintained and reputable packages.
* Review significant dependency changes.
* Address known high-severity vulnerabilities appropriately.
* Avoid installing packages from untrusted sources.
* Keep lockfiles consistent with the project's package-management workflow.

Unexpected or suspicious dependency changes should be reviewed carefully before merging.

---

# Security Contact

For security-sensitive reports, please use the **GitHub Security Advisory** reporting mechanism associated with this repository.

For general bugs, product issues, or feature requests, use the project's normal GitHub issue or contribution process instead.

---

# Acknowledgements

Growlancer appreciates the security community and responsible researchers who help identify weaknesses and improve the safety of the platform.

Researchers who responsibly report valid vulnerabilities may be acknowledged in Growlancer's security records or future advisories, subject to their preference.

---

## Final Note

The goal of this policy is to ensure that security vulnerabilities are reported, investigated, and remediated responsibly while protecting Growlancer users, contributors, and infrastructure.

**Growlancer Security Team**

> **Security is everyone's responsibility.**
