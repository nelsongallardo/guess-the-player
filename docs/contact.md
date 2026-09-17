# Public contact operations

Derabona publishes one project contact address:

- `contact@derabona.club`
- Purpose: privacy enquiries and general project contact
- Delivery: ImprovMX forwards the alias to a private inbox

The destination inbox, ImprovMX credentials, activation links and authenticated browser state are private operational data. Do not commit them, paste them into issues or PRs, or include them in screenshots and logs.

## DNS contract

The `derabona.club` zone must contain:

```text
MX  @  priority 10  mx1.improvmx.com
MX  @  priority 20  mx2.improvmx.com
TXT @               v=spf1 include:spf.improvmx.com ~all
```

Preserve unrelated records and the configured nameservers. DNS presence proves routing configuration, not inbox delivery.

## Safe verification

1. Query both authoritative and public DNS for MX and TXT records.
2. Confirm the domain and `contact` alias are active in ImprovMX without exposing the destination.
3. Send a real message from an unrelated mailbox to `contact@derabona.club`.
4. Have the inbox owner confirm receipt without sharing the private address, message contents or headers publicly.
5. Check `https://derabona.club/privacy.html` publishes only `mailto:contact@derabona.club` and still discloses ImprovMX forwarding in English and Spanish.

Use a visible normal browser for any owner-assisted sign-in or challenge. Follow `AGENTS.md`: verify the window is visible before requesting input, attach automation through CDP when an automation-launched browser is rejected, and close the task-scoped browser/debugging port afterward.