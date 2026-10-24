# AoIP Bandwidth Planner

Plan a Dante / AES67 audio network: draw devices, switches and links, describe the audio flows, and see how much of each link they use. Free, offline-capable web app (PWA) from [OnAir Garage](https://onairgarage.com).

- Tool page: https://onairgarage.com/tools/aoip-bandwidth-planner/
- Web app: https://onairgarage.com/apps/aoip-bandwidth-planner/
- Author: Graziano Melzi · OnAir Garage — hello@onairgarage.com
- License: MIT (see `LICENSE`)
- Manual: attached to every release as three PDFs, English (`AoIP-Bandwidth-Planner-Manual-EN-<version>.pdf`), Italian (`-IT-`) and Spanish (`-ES-`); the source is in `dev/manual/` (`python3 dev/manual/build.py <version> <folder>` makes the PDFs; it needs Chrome or Chromium).

## What it does

- **Network**: any number of devices and switches joined by links of 100 Mbps, 1 Gbps or 10 Gbps. Each link belongs to the **primary** or the **secondary** network (Dante redundancy). Nodes can be dragged (or moved with the arrow keys) on a schematic diagram; "Auto layout" arranges them.
- **Flows**: each flow has a source device, receivers, channels, sample rate (44.1 / 48 / 96 kHz), bit depth, delivery (unicast or multicast) and a model:
  - **AES67 (RTP)**: calculated from the packet times and sizes in documents by the standard's authors (the standard text itself was not read), with a packet time choice (125 µs, 250 µs, 333 µs, 1 ms, 4 ms, or custom samples per packet), channels per stream, and 16 / 24 bit.
  - **Dante (estimate)**: scaled from the figures Audinate publishes (Dante's own packet format is not public); 24 bit only.
  - **Copies** repeat identical flows (e.g. many devices with the same setup).
  - **Redundant** (Dante flows): the flow is also sent on the secondary network, routed and counted separately on each network.
- **Results**: every link shows two bars (one per direction, links are full duplex), filled with coloured segments, one per flow, with a tick at the safety threshold. Above the threshold a link turns amber, above its capacity red. Selecting a link lists the flows using it, with Mbps and packets per second.
- **Routing**: unicast flows are sent once per receiver along the shortest path; multicast flows are sent once per link, either only towards their receivers (IGMP snooping on) or flooded to every link reachable from the source (off).
- **Settings**: safety threshold (default 70 %), counting of preamble and inter-frame gap (line-rate load), 802.1Q VLAN tag (+4 bytes), IGMP snooping.
- **Plans**: saved automatically on the device, JSON export / import, three examples (small studio, radio station, redundant Dante network).
- Languages: English, Italiano, Español. The app always opens in English; a manual change is remembered. Theme: light, dark, or follow the system. Installable as an app (Install app button; Share → Add to Home Screen on iPhone/iPad; File → Add to Dock on Safari for Mac); works offline; shows an "update available" banner. Everything runs in the browser and nothing is sent anywhere; fonts (IBM Plex) are served locally.

## Formulas and sources

### AES67: calculated

The AES67 flows are calculated from the packet times and sizes given in documents by the standard's authors (listed below). The standard itself (AES67-2018 and its 2023 revision, sold by AES) was not read: see **Not validated**.

For a stream with `C` channels, sample rate `Fs`, `B` bytes per sample (L16 = 2, L24 = 3) and `S` samples per packet:

| Step | Formula | Source | Status |
|---|---|---|---|
| Samples per packet | 125 µs = 6, 250 µs = 12, 333 µs = 16, 1 ms = 48, 4 ms = 192 at 44.1 and 48 kHz; 12, 24, 32, 96, 384 at 96 kHz. At 44.1 kHz the counts equal the 48 kHz ones (real packet time = S / Fs) | [AES67 paper, NAB 2014](https://ravenna-network.com/wp-content/uploads/2020/02/AES67_Presentation_NAB_2014_-_Session_Paper_-_Hildebrand.pdf), [RAVENNA & AES67 white paper](https://ravenna-network.com/wp-content/uploads/2020/02/RAVENNA___AES67_V1.0.pdf), [AES67-101](https://www.aimsalliance.org/wp-content/uploads/2018/11/AES67-101-the-basics-of-AES67.pdf) | Read (documents by AES67's authors). The 96 kHz / 4 ms entry is "n.a." in the NAB paper (MTU restrictions) and 384 in the white paper; the planner accepts it and caps channels by the payload limit |
| Payload | `C × S × B`, at most **1440 bytes** per packet (chosen "to assure future compatibility with IPv6") | RAVENNA white paper, NAB paper | Read. AES67-101 says "0 to 1460 in principle" for IPv4 alone; the authors' documents give 1440 |
| Max channels per stream | `floor(1440 / (S × B))` (80, 60, 40, 30, 20, 10, 2 for the listed formats) | RAVENNA white paper, Table 2 | Read, reproduced by tests |
| Channels per stream | 1 to 8 must be supported; more than 8 is optional | RAVENNA white paper, NAB paper | Read. The planner defaults to 8 and warns above 8 |
| IP headers | RTP 12 + UDP 8 + IPv4 20 = 40 bytes | AES67-101 (RFC 3550, 768, 791) | Read. AES67 is defined for IPv4 (IPv6 out of scope) |
| Ethernet | header 14 + FCS 4 (+ 4 for an 802.1Q tag), and for line-rate load preamble + start delimiter 8 + inter-frame gap 12 | IEEE 802.3; frame layout also in AES67-101 (1518 / 1522 bytes) | 802.3 not read directly; standard Ethernet values |
| Bit rate | `(C × S × B + 40 + Ethernet) × 8 × Fs / S` | derived | Worked example: 8 ch, 48 kHz, 24 bit, 1 ms = 1152 + 78 = 1230 bytes × 1000 packets/s = **9.84 Mbps** |

### Dante: estimated

Dante's packet format is proprietary, so Dante cannot be calculated from a standard. Published figures, at 48 kHz / 24 bit:

| Figure | Source | Status |
|---|---|---|
| Unicast flow of up to 4 channels ≈ **6 Mbps** ("4 channels and 16 audio samples per channel"); samples per channel vary from 4 to 64 with the latency setting | [Adding Dante to Your Network (Audinate, 2020)](https://studio-tech.com/wp-content/uploads/2020/09/adding-dante-to-your-network-audinate-2020.pdf); [Dante Information for Network Administrators (Audinate, July 2026)](https://www.getdante.com/resources/catalog/networking/dante-information-for-network-administrators/) | Read |
| Multicast ≈ **1.5 Mbps per channel** | same two documents | Read |
| Audio traffic should not take up more than **70 %** of the bandwidth of any link | Adding Dante to Your Network (2020) | Read. Recommendation, not a limit |
| A flow costs a full flow even for 1 channel; 5 channels use 2 flows; another receiver needs another flow | Glensound, [Dante bandwidth](https://www.glensound.co.uk/assets/library/5ddff2e74d5e7-Dante%20bandwidth.pdf) | Third party (manufacturer), consistent with Audinate |
| 96 kHz ≈ twice the bandwidth (1 flow of 4 channels: 5.9 Mbps at 48 kHz, 11.8 Mbps at 96 kHz) | Glensound (measurements on a Brooklyn module) | Third-party measurement, no Audinate figure |

| Dante unicast flows carry 4 channels, multicast flows up to 8 (older devices); Dante devices in AES67 mode send AES67 as multicast flows; a Dante device in "Redundant" mode duplicates the audio on both ports; without IGMP snooping multicast reaches every receiver in the domain | [Powersoft application note DO000312.00 REV.00](https://www.powersoft.com/wp-content/uploads/app-note/PS_AN_Powersoft_Amplifiers_and_AoIP_Dante_AES67.pdf) | Read. Manufacturer note (not the standard): corroborates the model; its AES67 amplifier profile (1 ms, 48 kHz, L24, up to 8 channels per stream) matches the AES67 defaults |
| Dante's AES67 mode restrictions: AES67 flows are **multicast only** and **non-redundant**; transmit 48 kHz, L24, 1 ms, up to 8 channels per stream; receive L16 or L24 and 125 µs / 250 µs / 333 µs / 1 ms, up to 8 channels | Glensound DARK16AO (Dante / AES67) product manual, section "AES67 Restrictions" | Read. Manufacturer manual describing the Dante AES67 mode; confirms that AES67 flows are not duplicated on the secondary network |
| RTP is used with **no CSRCs and no header extensions** (so the RTP header is the fixed 12 bytes); up to 8 channels per stream; packet times 125 µs to 4 ms; required formats 16 bit and 24 bit at 48 kHz, optional 16 bit at 44.1 kHz and 24 bit at 96 kHz | "Open Standards in Pro Audio: AES67" slides (Conrad Bebbington, Focusrite) | Read. Presentation by an AES67 participant, consistent with the other documents |
| Redundancy: primary and secondary interfaces connect to two **separate** networks; "the same audio data is transmitted on both the primary and secondary networks simultaneously"; both interfaces of a redundant device must use the same link speed | [Dante Controller User Guide (Audinate)](https://dev.audinate.com/GA/dante-controller/userguide/pdf/AUD-MAN-DanteController-3.10.2.x-v1.0.pdf), section "Redundancy" | Read (version 3.10.2.x, © 2017; newer versions exist and were not read) |

Model: unicast = `ceil(C / 4) × 6 Mbps × (Fs / 48 kHz)`; multicast = `C × 1.5 Mbps × (Fs / 48 kHz)`. A redundant Dante flow is routed and counted once on each network. The planner warns when the two interfaces of a redundant device run at different speeds and when a switch connects the two networks. **Not documented, so not offered**: Dante at 16 bit, and samples-per-channel settings other than the typical 16. Dante on 10 Gbps links is not covered by the documents read.

## Assumptions and limits

- Audio traffic only. Clock (PTP), discovery, control and other traffic are not counted, nor QoS, latency or switch capacity.
- IPv4, untagged Ethernet unless the VLAN option is on, nominal line rates, one link between two nodes.
- Where two paths exist the shortest is used (spanning tree assumed; a loop is reported).
- AES67 streams are counted on the primary network only; AES67 redundancy schemes (e.g. SMPTE ST 2022-7) are not modelled.
- Some devices carry fewer channels per flow at high sample rates (Glensound: 2 channels per flow at 88.2 / 96 kHz on Ultimo devices): not modelled.
- The planner sizes a design; it does not replace a network capture.

## Validation and references

Results as of October 2026 (`node --test dev/*.test.js`, 38 tests):

| Reference | What it validates | Result |
|---|---|---|
| RAVENNA & AES67 white paper, Table 2 | maximum channels per stream for 7 formats (80, 60, 40, 30, 20, 10, 2) | reproduced exactly |
| AES67 packet-time tables (NAB 2014 paper, white paper) | samples per packet at 44.1 / 48 / 96 kHz | reproduced |
| Hand-worked example | 8 ch, 48 kHz, L24, 1 ms → 1230 bytes, 9.84 Mbps; frame-only 9.68 Mbps; 125 µs 14.21 Mbps | reproduced |
| Audinate figures | 4 ch = 6 Mbps, 5 ch = 12 Mbps, 64 ch unicast = 96 Mbps ("about 100 Mbps"), 8 multicast ch = 12 Mbps | reproduced |
| Glensound measured table | 8 / 16 / 32 flows at 48 and 96 kHz | estimate within 3 % |
| Independent RTP sender (ffmpeg on loopback), 7 cases: 2 and 8 channels at 48 kHz L24 with 125 µs / 250 µs / 1 ms, 44.1 kHz L16, 96 kHz L24, 4 ms | RTP header is the fixed 12 bytes (version 2, no padding, no extension, no CSRC); UDP payload = 12 + channels × samples × bytes; RTP timestamp step = samples per packet; steady-state packet rate = Fs / samples (e.g. 918.75 packets/s at 44.1 kHz) | all agree with the planner (`python3 dev/rtp-check.py`, needs ffmpeg) |
| Routing and load tests | direction of load, unicast duplication, multicast (snooping on / off), copies, thresholds, unreachable receivers, loops, import repair | pass |
| Dante Controller User Guide, "Redundancy" | same flow counted on both networks, networks routed separately, same-speed rule, no switch shared by the two networks | pass |
| Release consistency | `VERSION`, `CACHE_VERSION` and the footer agree; the tip card texts exist in English, Italian and Spanish and its link follows the language; the jar is cached for offline use; the manifest screenshots are declared with their real size | pass |

**Not validated**: touch targets (measured at 44 px or more with Chromium touch emulation at 375 px, not on a real phone or tablet) and the install flow on Android and iOS (the manifest has screenshots now, but the install sheet was not seen on a device); the UDP, IPv4 and Ethernet bytes on a real network (the ffmpeg check runs on loopback, where they are not visible; a Wireshark capture of an AES67 stream would confirm the 78-byte overhead); the exact text of the AES67 standard (AES67-2018 and the 2023 revision are sold by AES and could not be read; the figures come from documents by the standard's authors, and the 2023 revision, which clarifies channel-count and payload-format requirements, was not checked); Dante at other sample rates and bit depths.

Also consulted, with no figures used: the white paper "AES67, networked audio and the impulse towards interoperability" (context and history of the standard).

Related tool, not used by the planner: [aes67-monitor](https://github.com/philhartung/aes67-monitor) (MIT) discovers and monitors real AES67 streams (L16 / L24, up to 64 channels, 44.1 / 48 / 96 kHz, packet times from 0.125 to 4 ms) and can help check a real network.

## Sources to re-check

Last read on 2026-09-29:

| Document | Version read |
|---|---|
| RAVENNA & AES67 white paper V1.0 | 2020 upload |
| AES67, NAB Broadcast Engineering Conference 2014 | 2014 |
| AES67-101, the basics of AES67 (AIMS) | 2018 upload (a 2023 upload exists) |
| Adding Dante to Your Network (Audinate) | 2020 |
| Dante Information for Network Administrators (Audinate) | July 2026 |
| Glensound, Dante bandwidth | 22 November 2019 |
| Dante Controller User Guide (Audinate) | 3.10.2.x, 2017 (newer versions exist) |
| Powersoft, Amplifiers and AoIP (Dante/AES67) application note | DO000312.00 REV.00 |
| Glensound DARK16AO product manual (Dante / AES67) | undated, read 2026-09-29 |
| "Open Standards in Pro Audio: AES67" (Focusrite slides) | undated |

## Run locally

Static files, no build step. Serve the folder with any web server (service workers need `http://localhost` or HTTPS):

```bash
python3 -m http.server 8124
```

## Structure

- `index.html`, `style.css`, `fonts.css`, `app.js`, `model.js` (bandwidth model and routing), `plan.js` (plan data, validation, layout, examples), `diagram.js`, `i18n.js`, `sw.js`, `manifest.json`, `icons/` (the jar of the tip card included), `screenshots/` (manifest screenshots), `fonts/` — the app (served under `/apps/aoip-bandwidth-planner/`).
- `dev/` — tests and the icon generator; not deployed.
- `.github/workflows/` — `ci.yml` (tests on every pull request and push to `main`) and `release.yml` (publishes a release: run it from the Actions tab with the version; it checks the version against `app.js` and `sw.js`, runs the tests, and GitHub creates the tag on `main`).

Static-app constraints: relative paths only, strict CSP (no inline scripts or styles), service worker scoped to the app folder. Bump `CACHE_VERSION` in `sw.js` and `VERSION` in `app.js` on every release. Versions are `year.month.number` (e.g. `2026.10.1`), tags `v2026.10.1`.

## Credits

Fonts (SIL Open Font License 1.1, see `fonts/OFL-*.txt`): IBM Plex Sans, IBM Plex Mono — https://github.com/IBM/plex.
