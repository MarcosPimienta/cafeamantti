# Infrastructure & DNS Security Guide: Café Amantti

This guide outlines the steps to resolve external infrastructure vulnerabilities identified in the security report.

## 1. Subdomain Hardening
**Issue**: `admin.cafeamantti.com` points to an outdated cPanel/GoDaddy IP with a "Coming Soon" page.

**Action**:
- **Option A (Recommended)**: If the subdomain is not in use, delete the **A record** for `admin` in your DNS settings (GoDaddy/Vercel).
- **Option B**: If you plan to use it, migrate it to Vercel or update the software on the GoDaddy server immediately.

## 2. DNS Hardening (Spoofing Protection)
**Issue**: Missing DMARC and CAA records.

**Action**: Add the following TXT records to your DNS provider:

### DMARC Record
- **Type**: `TXT`
- **Host**: `_dmarc`
- **Value**: `v=DMARC1; p=quarantine; adkim=s; aspf=s;`
- *Note: `p=quarantine` will send suspicious emails to the spam folder. Once verified, change to `p=reject`.*

### CAA Record
- **Type**: `CAA`
- **Host**: `@` (Root)
- **Value**: `0 issue "letsencrypt.org"`
- *Note: This prevents unauthorized Certificate Authorities from issuing certificates for your domain.*

## 3. Restricting Exposed Services
**Issue**: cPanel admin ports (2082, 2083, 2095, 2096) are open to the public.

**Action**:
- Access your GoDaddy/cPanel firewall settings.
- Restrict access to these ports to your specific IP address (White-listing).
- If you don't use webmail via cPanel, close ports 2095/2096.

## 4. Subdomain Takeover Prevention
**Action**: Periodically audit your DNS records for "ghost" subdomains that point to services (like S3 buckets or old IPs) that no longer exist.
