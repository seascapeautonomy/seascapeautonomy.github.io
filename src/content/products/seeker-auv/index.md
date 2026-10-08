---
title: Seeker AUV
kind: Platform
order: 1
tagline: A highly manoeuvrable AUV for seafloor survey.
summary: Two-person portable, modular and hover-capable — built to capture low-altitude, high-resolution, geo-referenced imagery over complex terrain.
cover: ./cover.png
coverAlt: Seeker AUV underwater
models:
  - { file: seeker-imaging.glb, label: Imaging, description: Stereo imaging payload }
  - { file: seeker-sidescan.glb, label: Sidescan, description: Sidescan sonar payload }
modelFieldOfView: 28deg
sectors: [defence, offshore, environmental]
highlights:
  - { title: Two-person portable, text: "45 kg and deployable from small vessels without a crane." }
  - { title: Hover capable, text: "Holds position, dives vertically and works in constrained spaces." }
  - { title: Terrain following, text: "Stays close to the seafloor over rough reef and around structures." }
  - { title: Open architecture, text: "Integrate new payloads without significant cost or development effort." }
specs:
  - group: Vehicle
    items:
      - { label: Length, value: 1.71 m }
      - { label: Diameter, value: 0.25 m }
      - { label: Mass, value: 45 kg }
      - { label: Depth rating, value: 300 m }
      # TODO: the old site listed 8 h endurance; 6+ h matches the new home page.
      - { label: Endurance, value: 6+ h }
      - { label: Range, value: 16 km (10 nmi) }
      - { label: Imaging speed, value: 0.5–0.7 m/s }
      - { label: Imaging altitude, value: 2 m }
      - { label: Pixel resolution, value: 0.6 mm }
  - group: Base payload
    items:
      - { label: Navigation, value: Nortek Nucleus 1000 }
      - { label: Acoustic modem / USBL, value: AdNav Subsonus / EvoLogics }
      - { label: Obstacle avoidance, value: Impact Subsea ISA500 }
      - { label: Cameras, value: "2 × downward 8 MP, 1 × forward 2 MP" }
      - { label: Lighting, value: Forward and rear strobes }
      - { label: Compute, value: NVIDIA Jetson Xavier NX }
      - { label: Communications, value: "FreeWave ZumLink 900, LoRa, Wi-Fi, Iridium, GigE" }
videos: [jC2b_zxD9jU, _FObuXCuHuA]
---

The Seeker AUV is a two-person portable, modular, hover-capable and highly manoeuvrable AUV developed at the Australian Centre for Robotics. Designed for capturing low-altitude, high-resolution, geo-referenced seafloor imagery over complex underwater terrain, it can also be readily reconfigured for novel optical, acoustic and water-column sensing missions.

It can hold position, dive vertically and move in constrained spaces around man-made structures, behind the breaking waves of a beach or over rough reef environments, all while staying close to the seafloor.

Its open software and hardware architecture allows additional payloads to be integrated without significant cost in materials or development effort. The nose and forward regions provide space for additional sensors, including optical or hyperspectral cameras, sonar systems or water-column sensors. The vehicle frame can also be extended for additional payload space or battery capacity, further increasing endurance.
