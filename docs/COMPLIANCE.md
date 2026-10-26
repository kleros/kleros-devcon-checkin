# Devcon 8 compliance review · booth check-in site, database and booth QR codes

Reviewed 23 Oct 2026 against:

- **Devcon 8 Booth Guidelines 2026** (EF, sent 1 Sep, "ensure you understand and comply"), all 4 pages
- **Devcon VIII India Supporter Agreement** (signed revised version, countersigned 10 Sep), all 19 pages
- **Devcon 8 Supporter Announcement Guidelines** (EF Comms)
- **Community Hubs announcement** (EF forum, 9 Sep): hubs "must not promote any single project… must remain strictly educational"

The key rules: Devcon is "a purely educational conference" with a ban on solicitation, sales, marketing and promotions (BG 2). No promoting tokens, NFTs or other regulated products (BG 4, SA 5.2(d)). No QR codes or links that let people buy, trade or invest in them (BG 6). No profit promises (BG 9c). Avoid naming partners that run regulated crypto businesses (BG 10). Stick to technology and education (BG 11). These apply to websites and to conversations at the booth (BG 12). Never imply endorsement by or partnership with the EF (SA 5.2(b)(c), 8). Devcon marks only with approval (SA 7.3, 7.5). Kleros is the independent controller of attendee data, needs its own clear privacy notice, and may only use the data for purposes attendees consented to (SA 6.5).

## Fixed in this pass

| Issue | Rule | Fix |
|---|---|---|
| Juror card said "Earn by staking PNK" and linked to kleros.io/earn-become-a-juror, which shows "Buy PNK", staking and rewards | BG 4, 6, 9c; SA 5.2(d) | Reworded to how jurors are drawn and vote; links to docs.kleros.io |
| Proof of Humanity card mentioned airdrops and UBI and linked to the PoH app (deposits, PNK airdrop) | BG 4, 6 | Reworded to one-person-one-vote and quadratic funding; links to the PoH docs page |
| Enterprise pitch named Lemon Cash (crypto exchange) with a "90% retention" claim and "fraction of traditional cost" | BG 10, SA 5.1(c) | Removed the partner name and the claims |
| Prediction markets pitch named Seer and Omen | BG 10 | Removed partner names |
| Other links went to kleros.io pages, which all carry a site-wide "PNK token" link | BG 6 | All links now go to docs.kleros.io, ai.kleros.io or Scout, none of which have a token purchase call to action |
| Ticket screen said "Kleros × Devcon VIII" (reads as a co-branded partnership) | SA 5.2(c), 8 | Now "Kleros booth · Devcon VIII" |
| No statement that the page isn't EF/Devcon's | SA 5.2(b), 8 | A footer disclaimer was added, then removed on 24–25 Oct at Wei Wei's request (it read awkwardly), together with the privacy-notice sentence saying EF and Devcon don't receive the data. The agreement bans implying endorsement but doesn't require a disclaimer; the page stays clearly Kleros-branded, with no Devcon or EF marks and no co-branding |
| Privacy text didn't name the controller, the retention period, or the background research | SA 6.5 | Added "How your details are used": controller (Cooperative Kleros, Paris), purposes including public-profile research, storage and retention, how to ask for deletion |
| Devcon 8 emblem used as the page hero | SA 7.3, 7.5 | Already replaced with the Kleros icosahedron. The only Devcon reference left is the plain-text "Devcon VIII · Mumbai" |
| Hub copy | Community Hubs rule | Neutral, topic-only descriptions using the EF's own hub names. No hub is presented as Kleros's |

The restricted financial terms ("currency", "securities", "custodian", "depositories") don't appear anywhere on the page.

## Merch tiers and Kleros 101 (added 26 Oct)

- **Quiz content** (`site/quiz.js`) is about how Kleros works: who decides a case, agent-to-agent disputes, appeals. No token, staking, rewards or "earn" wording (BG 4, 9c, 11). Its links go to docs.kleros.io and ai.kleros.io only (BG 6).
- **Privacy.** The Telegram step stores the visitor's Telegram username and account ID; the privacy notice now says so (SA 6.5). As a group admin, the bot also receives the group's messages: the backend skips them and stores nothing from them.
- **Merch thumbnails** use the supplier mock-ups. Proof of Humanity merch is left out of the tiers for now (see 8 below).

## Needs a decision (not changed)

1. **Updates consent is required to check in.** *(Softened 24 Oct: the box now signs people up to the Kleros blog through Ghost's own double opt-in, so nobody receives updates without confirming by email. The tick itself is still required.)* SA 6.5 says the data may only be used "for the purposes notified to and consented to". Making marketing emails a condition of getting merch is bundled consent, and under GDPR that isn't freely given. The safer option: a required tick for "Kleros can follow up about what I shared", plus an optional newsletter tick.
2. **Merch-for-contact-details.** BG 2 bans "any form of solicitation… marketing, promotions". A sign-up page in exchange for merch is standard practice, but with these rules it's worth one line to Juana (EF supporter contact) to confirm it's fine. *(Merch tiers, 26 Oct: better merch for joining the Kleros Telegram and following Kleros on X and LinkedIn. Wei Wei's call: follow-for-merch is standard at web3 conferences and nothing is sold, so no extra check needed. The Gold step, a quiz on how Kleros works, is educational.)*
3. **Privacy contact.** The notice shows `weiwei@kleros.io` (from `config.js`). A shared inbox would be better.

## Outside the website (flagged, not changed)

4. **Printed booth QR codes.** *(Replaced: new codes in `qr/` point only to devcon.kleros.io.)* The old gooey.ai codes: "Kleros QR 2/4/5" go to gooey.ai/2/21XDk → **kleros.io**, whose navigation links to the PNK token page. "PoH QR 1" goes to gooey.ai/2/ndw7k → **poh.id**, which links to a PNK airdrop and mentions deposits and staking. "Kleros QR 1/3" and "PoH QR 2" couldn't be decoded. That's close to BG 6 ("no QR codes or links that… enable others to… purchase Regulated Products"). These are gooey.ai redirect links, so their destination can likely be changed without reprinting. Point them at the booth check-in site or at docs.kleros.io.
5. **Backdrop poster** ("Kleros backdrop bollywood"). It uses "DEVCON VIII · Mumbai, India" with an Ethereum-diamond mark. Devcon marks need EF approval (SA 7.3, 7.5), and the Announcement Guidelines invite supporters to send custom Devcon-branded graphics for review. Send it to Emily Vaughan / Juana before printing if it hasn't been approved.
6. **Booth conversations** are covered too (BG 11, 12f). Brief booth staff to keep PNK price, staking yields and "where to buy" out of conversations, and to talk about how the technology works.
7. **Research agents.** The privacy notice now discloses public-profile research. Agents must stick to public professional sources (`docs/RESEARCH_AGENT.md`), and anyone who objects should be removed from the Sheet.
8. **Proof of Humanity charm.** Not in the merch tiers for now. If it's handed out: its back carries a QR code to **poh.id** (decoded from the Web3Merch mock-up), the same destination flagged in 4, which links to a PNK airdrop and mentions deposits and staking (BG 6). Check what poh.id shows during Devcon.
