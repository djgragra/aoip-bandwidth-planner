# AoIP Bandwidth Planner manual

The AoIP Bandwidth Planner helps you plan a Dante / AES67 audio network: you draw devices, switches and links, describe the audio flows, and see how much of each link they use. It is a free web app (PWA) from OnAir Garage that works offline after the first visit. Everything runs in your browser and nothing is sent anywhere.

## Open and install

Open the planner at `https://onairgarage.com/apps/aoip-bandwidth-planner/` (the tool page is `https://onairgarage.com/tools/aoip-bandwidth-planner/`). Nothing is installed to use it. You can also install it as an app:

- **Chrome, Edge and other Chromium browsers**: press the *Install app* button.
- **iPhone and iPad (Safari)**: tap the Share button, then "Add to Home Screen".
- **Safari on Mac**: File menu, then "Add to Dock".

The app always opens in English; change the language in the header (English, Italiano, Español) and the choice is remembered. The theme can be light, dark or follow the system.

## Drawing the network

In *Devices and switches* you build the network:

1. Press **Add** to add a **device** or a **switch** (give it a *Name* and choose its *Type*). The number of nodes is limited ("Limit reached" tells you).
2. Use **Connect to** and **Link speed** to join a node to another with a link of 100 Mbps, 1 Gbps or 10 Gbps.
3. Each link belongs to the **primary** or to the **secondary** network (the *Network* choice): this is how Dante redundancy is drawn.
4. Drag the nodes on the schematic diagram (or move them with the arrow keys); *Auto layout* arranges them. **Remove** deletes a node.

## Describing the flows

In *Flows* press **Add flow** (you need at least one device first). Each flow has:

- a **Name**, a **Source** device and the **Receivers** (with no receiver selected a flow carries nothing yet);
- the **Delivery**: unicast (one stream to each receiver) or multicast;
- the number of **Channels**, the **Sample rate** (44.1, 48 or 96 kHz) and the **Bit depth**;
- the **Model**: **AES67 (RTP)** or **Dante (estimate)**;
- **Copies**, to repeat identical flows (for example many devices with the same setup), and, for Dante, **Redundant**: the same audio is also sent on the secondary network, and it is routed and counted separately on each network.

For **AES67** you also choose the **Packet time** (125 µs, 250 µs, 333 µs, 1 ms by default, 4 ms, or a custom number of samples per packet) and the **Channels per stream**; the 16- and 24-bit sizes are calculated. **Dante** is an **estimate** scaled from the figures Audinate publishes (Dante's own packet format is not public), for 24 bit only. *Calculation details* shows how a flow's figure was obtained. *Duplicate* copies a flow; *Remove* deletes it.

## Reading the results

- Every link shows **two bars**, one per direction (links are full duplex), filled with coloured segments, one per flow, with a tick at the **safety threshold**. Above the threshold a link turns amber, above its capacity red.
- Select a link in the diagram or in the list: *Link details* shows its capacity and, for each direction, the flows using it, with Mbps and packets per second.
- **Routing**: unicast flows are sent once per receiver along the shortest path; multicast flows are sent once per link, either only towards their receivers (*IGMP snooping* on) or flooded to every link reachable from the source (off).
- *Total on the busiest link* gives the highest load in the plan.

## Settings and plans

In *Settings*: the **Safety threshold** (70 % by default: Audinate recommends keeping audio traffic under 70 % of any link), **Count preamble and inter-frame gap** (line-rate load), the **802.1Q VLAN tag** (adds 4 bytes to every AES67 packet) and **IGMP snooping**.

In *Plan*: the plan is **saved automatically on this device only**. **Export JSON** saves it to a file and **Import JSON** loads one (after you confirm replacing the current plan). **Load an example** offers three: a small studio, a radio station and a redundant Dante network.

## Language, theme and privacy

The language and the theme are remembered on the device. Everything runs in the browser, the fonts are served locally and nothing is sent anywhere. A small tip card at the bottom has the jar of the site and a link to the tip page of onairgarage.com in your language in a new tab; nothing is asked inside the planner.

## Updates

When a new version is ready, an "update available" banner offers to reload. Ignoring it just keeps the current version running.

## Limits

- **Audio traffic only**: the clock (PTP), discovery, control and other traffic are not counted, nor QoS, latency or switch capacity.
- IPv4, untagged Ethernet unless the VLAN option is on, nominal line rates, one link between two nodes.
- Where two paths exist the shortest is used (spanning tree assumed; a loop is reported).
- AES67 streams are counted on the primary network only; AES67 redundancy schemes (such as SMPTE ST 2022-7) are not modelled.
- Some devices carry fewer channels per flow at high sample rates: this is not modelled.
- The Dante figures are estimates. The planner sizes a design; it does not replace a network capture.

## Troubleshooting

| Problem | What to do |
|---|---|
| "Limit reached" when adding a node | The plan has the maximum number of devices and switches: remove one first. |
| A flow carries nothing | Select its source and at least one receiver ("No receivers selected"). |
| A link is red | The flows exceed its capacity: use a faster link, fewer channels, multicast or another path. |
| The imported file is refused | "This file is not a valid plan": import a JSON exported by this planner. |
| The *Install app* button is not there | The browser may not offer it: on iPhone, iPad and Safari for Mac use the steps in the Open and install chapter. |

## Contacts

Graziano Melzi · OnAir Garage — `https://onairgarage.com` — `hello@onairgarage.com`. Tool page: `https://onairgarage.com/tools/aoip-bandwidth-planner/`. Source code and releases: `https://github.com/djgragra/aoip-bandwidth-planner`. Licence: MIT © 2026 Graziano Melzi.
