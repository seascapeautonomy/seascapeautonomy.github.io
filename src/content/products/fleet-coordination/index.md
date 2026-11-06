---
title: Fleet Coordination
kind: Operations
order: 2
tagline: Surface relays that decouple the ship from AUV operations.
summary: Surface buoys and ASVs relay communications between the Seeker fleet and operators, so several AUVs can be monitored and coordinated at once while the ship works elsewhere.
# TODO: replace with a photo of the surface buoy or ASV.
cover: ./cover.jpg
coverAlt: Two Seeker AUVs on the back deck of a survey vessel at sunrise
sectors: [defence, offshore, environmental]
models:
  - { file: bob.glb, label: Bob, description: Bob surface relay buoy }
modelFieldOfView: 30deg
fleetReplay: coordinated-survey
highlights:
  - { title: Decoupled from the ship, text: "The vessel is no longer tied to a single vehicle or instrument while AUVs survey." }
  - { title: Multi-vehicle coordination, text: "Monitor and coordinate several Seekers at once from one operator station." }
  - { title: Live oversight, text: "Vehicle status and position relayed to operators throughout the mission." }
  - { title: Scales with the fleet, text: "Coverage grows with the number of vehicles, not with ship time." }
# TODO: add specs once available, e.g. relay range, comms links, endurance and deployment.
---

<!-- TODO: draft text based on a short description; check and expand with real details. -->

Conventional survey ties the ship to the sensor: one vessel tows or tends one instrument, and coverage only grows with more ship days. Our fleet coordination approach breaks that link.

Surface buoys or an autonomous surface vessel (ASV) act as communication relays above the survey area. Each Seeker AUV stays in contact with the relay underwater, and the relay links back to operators on the ship or ashore. Operators can monitor every vehicle's progress and health, and coordinate the fleet, without the ship having to stay over any one of them.

## What this enables

- **Many vehicles, one vessel:** a single support vessel can deploy and oversee several Seekers surveying in parallel.
- **A free ship:** the vessel can deploy and recover vehicles, run other work, or stand off while the AUVs survey.
- **Survey at scale:** add vehicles to cover larger areas in the same time, making landscape-scale benthic survey practical.

## How it works

1. Seeker AUVs are deployed across the survey area, each with its own mission.
2. A surface relay — a moored or drifting buoy, or a station-keeping ASV — is positioned over the area.
3. The relay passes vehicle status and position to operators, and operator commands back to the vehicles.
4. Operators supervise the whole fleet from one place and intervene only when needed.
