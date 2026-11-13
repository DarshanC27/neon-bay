# 🌴 NEON BAY: an original open-city game

A full 3D open-world driving, superhero and crime-sandbox game that runs in any modern browser. Plain HTML +
JavaScript with a bundled copy of Three.js (`lib/`): no install, no build step, no internet needed.

**Play:** double-click `index.html` (Chrome or Edge), or run `python launch.py` from the Hack folder and open http://localhost:8003

## What you can do
- **Four playable characters (press C to change suit):** Kai (regular human), **Spindle** (swings on grapple lines between
  rooftops, wall-climbs, web shots), **Wraith** (hooded free-runner: climbs anything, silent takedowns, smoke bombs, leap-of-faith
  dives into hay carts or water) and **Nova** (charged super jump, slow-motion dash, ground-pound shockwave)
- **Street fights:** Saltwater Boys gangs on rooftops and street corners, punch combos, knockouts, crew-clear bonuses
- **3D city:** chase camera with mouse look, animated characters, cars with spinning wheels and suspension, day/night lighting,
  neon, rain, a searchlight helicopter
- **Drive anything:** 11 cars (hatchback, SUV, pickup, muscle, supercar…), a **sport motorbike** and a **bicycle**, with drift physics (handbrake), nitro, damage, smoke and wrecks. Carjack traffic or steal a police car.
- **Manual gearbox (optional):** R · N · 1–6 with a rev counter, shift light, engine braking, a rev limiter and over-rev protection
- **Living city:** lane-following traffic, pedestrians that walk, cross, dodge and flee, streetlights, a day/night cycle, rain and lightning
- **Cops:** a 5-star wanted level, pursuit AI that routes through the streets, a helicopter with a spotlight from 3 stars, getting caught, evading
- **Story:** 4 missions with Vince and Marlo (Fresh Start → Special Delivery → Heat Check → Kingpin Grand Prix)
- **Side jobs:** RideBay rideshare (passenger ratings and tips), timed courier deliveries with fragile cargo, 3 street races against AI
- **Stunts:** 8 yellow ramps with airtime cash, double for unique jumps
- **Collectibles:** 25 hidden neon tokens (find them all for $10,000 and a free Neon X)
- **Shops:** Spray Shack (respray, repair, lose the cops), Turbo Motors dealership, Neon Bites, hospital, your crib (save, sleep, garage)
- **Phone:** rideshare, races, story, garage delivery, stats, settings
- **Map:** a rotating GPS minimap and a full city map with click-to-set waypoints and road routing
- **Radio:** 3 generative stations (synthwave, lo-fi, drum and bass) plus synthesized engine, screech, siren and crash sounds
- Autosave every 30 seconds, plus Continue on the title screen


## 🌐 Online multiplayer + voice chat
Play in the same city with friends and talk to them.

1. Start the server: `python mp_server.py` (or `python launch.py` from the Hack folder, which runs it on :8003)
2. Open **http://localhost:8005** on this PC. Other PCs and phones on the same Wi-Fi open the **https://&lt;pc-ip&gt;:8445** link the server prints, and click *Advanced → Proceed* once (browsers only allow the microphone over https).
3. On the title screen press **🌐 PLAY ONLINE**, type a name and the **same room name** as your friends, press CONNECT and allow the microphone. Then press NEW GAME or CONTINUE.

- **Smooth sync:** 20 updates/second, timestamped against the server clock and shown ~0.1 s behind with interpolation, so other players glide instead of teleporting. Short packet loss is covered by extrapolation, and dropped connections reconnect by themselves.
- **Proximity voice (WebRTC, peer-to-peer):** voices are 3D. They're louder when close, panned left and right, and silent past ~150 m. They're muffled through buildings and when someone is inside a car. Echo cancellation and noise suppression are on. Use headphones.
- **Keys:** `N` mic mode (open mic → push-to-talk → muted) · hold `T` to talk in push-to-talk · `Y` proximity ↔ party chat (everyone hears everyone) · `Enter` text chat. You can also click the player list to change the mic mode.
- **Contact:** cars bump off each other, you can punch other players, and a car can run you over. Everyone sees the same time of day and weather, set by the room host.
- **Shared vs local:** players, their cars, voice, chat, time and weather are shared. Traffic, pedestrians, cops, gangs and missions are still each player's own.
- **Play over the internet, with no server:** open the game from its GitHub Pages link. Without `mp_server.py` the game switches to **peer-to-peer**: the first player in a room hosts it in their browser and everyone else connects straight to them over WebRTC. The public PeerJS broker only introduces the browsers to each other. If the host leaves, the next player takes over automatically. The host's browser is the room server, so keep that tab open.
- Peer-to-peer works on networks that block devices from seeing each other (like university eduroam), because traffic goes out through the internet. It uses public STUN. Two players behind the *same* strict network (for example both on eduroam) also need a TURN relay. Add one in `js/p2p.js` or with `?turn=turn:host:port,user,pass`.
- `python tests/multiplayer_test.py` (with the server running) plays two Chrome players against each other: 27 checks, including riding as a passenger.

## 🗺️ The Bay Region: four cities
The map grew from one island to a ~14 km region. **Neon Bay** is unchanged (same streets, missions and saves); three
mainland cities sit on the same road grid and are joined by highways:

| City | Look |
|---|---|
| **Neon Bay** | The original island city: downtown, docks, beach, parks |
| **Highgate** (east, over the Bay Bridge) | Glass skyscrapers up to ~60 storeys with beacon masts, midtown offices, a riverside park |
| **Port Calder** (south, over the causeway) | Red-brick old town, a container port with cranes and stacked containers, a harbour green |
| **Sierra Vista** (south-east) | Desert adobe town, a neon casino strip with pools and palms, ranches with cacti |

- **Highways:** Route 1 (Bay Bridge, a suspension bridge with towers and cables), Route 2 (Calder Causeway), Route 9 (Mesa Pass) and Route 5 (Desert Line). They have green overhead signs with distances, highway lamps and two gas stations.
- **Countryside:** forests and farm fields in Green Valley, and cacti and boulders in the Red Mesa Desert. The sea now shows through the coastline.
- Traffic, pedestrians, cops, GPS routing and the minimap work everywhere. The city map labels every city.
- **Performance:** the ground streams in 24×24-tile chunks with detailed textures near the camera, and buildings, trees and lamps beyond the fog are skipped. The four cities run as fast as the old single island.

## 🏍️ Bikes, manual cars and riding together
- **Sport motorbike (Raptor 600) and bicycle (Urban Pedal):** a rider sits on the bike, leans into corners, pops small wheelies under hard throttle, and the cyclist pedals. A hard crash throws you over the handlebars. There's one of each outside your crib, more in parking bays, and both are sold at Turbo Motors.
- **Manual gearbox:** turn it on with `L` or Phone → Settings → Gearbox. Shift up with `I` / `.` and down with `U` / `,`. A controller uses LB / RB in a manual car, and touch screens get ▲ / ▼ buttons. Go below 1st for N, then R. Each gear has its own top speed and torque curve. You get engine braking off the throttle, a bouncing limiter at 7,200 rpm, and protection that refuses a downshift that would over-rev.
- **Two people, one car (online):** walk up to a friend's car or motorbike and press **F** to ride as their passenger. You sit in the passenger seat or on the pillion, the camera follows the car, and voice chat keeps working. Press **F** again to get out.
- **Realistic cars:** a seated driver behind see-through glass, with seats, a dashboard and a steering wheel. Glasshouses taper inwards towards the roof, and the cars have alloy wheels, door mirrors, grilles and number plates. The SUV has roof rails and the pickup has an open bed.

## 🚁 Sky, sea and city jobs
- **Helicopters (Skylark H1):** spin up the rotor, `Space` climbs, `Shift` descends, `W`/`S` pitch forward/back, `A`/`D` yaw. Land on rooftops. Helipads at the Neon Bay beach, Highgate park and Sierra Vista, plus one on the police roof. The speedo shows your altitude.
- **Boats (Wave Runner 24):** they plane on the water with a bow wave and a wake, bob on the swell and stay off the land. Marinas at Neon Bay and Port Calder. Step ashore with `F` next to the shore.
- **City jobs:** Sky Courier (Highgate: land on three skyscraper roofs), Smuggler's Run (Port Calder: speedboat round the coast), Casino Getaway (Sierra Vista: start with 3 stars) and the **Grand Tour** race through all four cities.
- **The Highgate Vault (co-op heist, works solo too):** one player cracks the vault while the other waits in the getaway car, then you lose the cops together and meet at the desert hideout. $25,000 each when you finish as a crew.
- **Cameras and handling:** `C` in a vehicle cycles chase / far chase / **cockpit view**. Phone → Settings → Car handling switches between the **realistic** tyre model (slip angles, weight transfer) and arcade grip. On phones, **TILT** steers and flies by tilting the phone.

## 🚑 Emergency services
- **Crashes get a response:** wrecks in the cities are reported. A **fire engine** comes for a burning wreck, and the firefighters hose it down (water jets, steam). A **tow truck** then hooks the wreck up and hauls it away, so the street really clears.
- **Paramedics:** a pedestrian knocked down hard stays hurt on the ground. An **ambulance** (from the hospital when it's close) arrives, and the crew kneel and give CPR until they're back on their feet.
- **Traffic pulls over:** cars move to the kerb and slow down for any siren coming up behind them, and queue at an accident scene instead of driving through it.
- **First aid:** reach someone hurt before the ambulance does and press `E` to help them up (+$150).
- At the scene the sirens stop but the lights keep flashing. Stealing an emergency vehicle is a 2-star crime.

## 🎞️ Graphics: film look, people, traffic lights
- **Post-processing:**
  - The scene renders in HDR (half-float, 4× MSAA), then gets a 3-level bloom, ACES filmic tone mapping, colour grading (tinted shadows, warm highlights), a vignette and fine film grain.
  - Neon, headlights, lit windows and the sun glow; bloom is stronger at night and in the rain.
  - Nitro adds a subtle lens fringe.
  - Turn it off with Phone → Settings → *Graphics: bloom + film look* (phones skip it automatically).
- **Better people:** painted faces with eyes, brows and lips, a nose, a rounded head and pelvis, shoulders, t-shirt sleeves and six rounded hairstyles (short, buzz, long, bun, curly, quiff). All existing animations still work.
- **Traffic lights:** 156 signalled junctions across all four cities on a 20-second cycle (green, amber, all-red). AI traffic brakes to the white stop line on red, decides on amber whether there's room to stop, queues behind the car in front and clears the junction once it's past the line. The lamps glow through the bloom at night.

## 📸 Realism pass
- **Reflections:** every 2 seconds the sky, sun and a band of city neon are rendered into an environment map. Car paint (clear-coat), glass, chrome hubs, the sea and wet roads reflect it, so reflections follow the time of day.
- **Rain that soaks the city:** roads turn dark and glossy as it rains and mirror headlights and neon. They dry out slowly afterwards, not all at once.
- **Shaped cars:** bodies have a sloped hood, raked windshield, tapered cabin and rounded edges instead of boxes, plus a soft contact shadow under every car. Geometry is shared per car type, so it costs no frame rate.
- **Moving clouds** whose colour follows sunrise, sunset, night and storms.
- **Engine sound with a real gearbox:** six gears scaled to each car's top speed, 900 to 7,200 rpm, a dip on every gear change, a bouncing rev limiter and flare under wheelspin. In multiplayer, other players' engines are heard in 3D from where their cars are.

### Realism pass 2
- **Driving physics (Realistic handling):**
  - Real acceleration curves: a saloon does 0–100 km/h in about 4 s and a supercar in about 2.6 s. Top speeds are unchanged.
  - Grip limits launch and braking. Too much throttle spins the wheels, with smoke and marks. Brakes stop a car from 100 km/h in about 35 m, and further in the rain.
  - Cornering grip, rolling resistance and aero drag are at real levels.
  - Bodies roll out of a corner and dip their nose under braking.
- **Crash damage:** impacts crumple the front, rear or sides of the body where you were hit. Lamps break, the windscreen cracks, and wrecks put their hazard lights on.
- **Traffic:**
  - Cars indicate before turning and while pulling over for sirens.
  - Every driver has their own cruising speed and following distance. They follow the car ahead smoothly, ease on and off the pedals, and take a moment to pull away when the light turns green.
- **Pedestrians:** they stop at the kerb and look both ways before crossing, and run if a car comes. Some stop for a moment on the pavement, and everyone walks faster in the rain.
- **Sound:**
  - The engine has harmonics, combustion noise and load-dependent grit, and it pops on the overrun.
  - Tyre roar gets louder on dirt, and you hear wind at speed, rain, and tyre hiss on wet roads.
  - Sirens wail (police) or yelp (ambulance and fire) with Doppler and stereo pan. Cars passing you are heard with Doppler too.
  - Streets echo between tall buildings. There's a city hum, birds by day and crickets at night.
- **City:** worn roads with patch repairs, cracks, manholes, polished wheel tracks and oil drips at the lights. Building bases are darker where they meet the ground, facades have rain streaks, and tree crowns are fuller and rounder.

## 🎯 Campaign: 100 missions
Press **P → 🎯 Missions** to see every chapter. The next mission is always marked on your map with its contact's face; walk or drive into the marker and press **E**. Completed missions can be replayed straight from the phone.

| # | Chapter | Contact | Flavour |
|---|---|---|---|
| 1–10 | Fresh Wheels | Vince | joyrides, time trials, smashing stalls, speed runs, a first race |
| 11–20 | Courier Nights | Lola | fragile timed deliveries, VIP taxi rides, getaways |
| 21–30 | Saltwater War | Vince | street brawls, rooftop fights, two-wave ambushes, takedowns |
| 31–40 | Street Kings | Marlo | races against AI rivals, drift scoring, hot laps |
| 41–50 | Hot Pursuit | Det. Reyes | stolen hot cars, surviving at 3–5 stars, getaways |
| 51–60 | Hero Hours | Dr. Ada Chen | suit up, rooftop-beacon swinging, rescues, gang fights |
| 61–70 | Stunt City | Jett | ramp stunts, sound-barrier speed runs, demolition derby |
| 71–80 | Ghost Protocol | Mr. Shade | tailing without being spotted, escorts, quiet takedowns |
| 81–90 | Bay Blackout | The Admiral | the hardest mix of everything |
| 91–100 | Neon Crown | Vince | multi-stage finales chaining 2–3 mission types |

Every mission has an animated title card, a briefing, a live objective arrow, progress meters (drift score, cargo health, tail distance...), and a **gold / silver / bronze medal** (time and damage) with fireworks and slow-motion when you pass. Finishing a chapter pays a bonus.

## ✨ Living city (`js/spectacle.js`)
- **Bay Eye:** a neon Ferris wheel on Sunset Beach with rainbow chasing lights and gondolas that stay upright
- **A neon blimp** circling the city with a scrolling LED ad sign
- Seagull flocks, boats with wakes circling the island, hot-air balloons, and an airliner with blinking nav lights
- Sweeping searchlights over the Central Plaza and animated rooftop billboards at night
- **A fireworks show over the bay every night (21:00–23:30)**, with real light flashes on the city

## 🎬 Cut-scenes, ending & achievements (`js/finale.js`)
- **Chapter cut-scenes**: finishing a chapter plays a letterboxed cinematic (orbit, then a crane shot) with a fireworks barrage and the next chapter's teaser
- **Grand finale**: mission 100 triggers a 40-second ending with five camera shots (hero crane, Bay Eye orbit, downtown fly-through, city sweep, final push-in), non-stop fireworks and rolling credits showing your stats and medals. It drops you back into free roam
- **14 achievements** with animated unlock cards (+$1,000 each), saved with your game
- **🏆 Progress phone app**: completion %, medals, achievements, plus "Watch the ending" once you've earned it
- Every cut-scene can be skipped with ESC / SPACE
- `python tests/finale_test.py`: 12/12 checks

## 🕷️ Crimson Spindle (press X)
An original red-and-black nano-suit for the web-slinger. It has angular white lenses, a black crown seam, a silver chevron emblem, black shoulders and boots, and glowing red seams.
- **X** plays a nano-suit transformation: red and black particles spiral up the body, with slow-mo, a shockwave and a camera shake. Press X again to switch back.
- It's faster and stronger than Spindle and swings the same way (hold SPACE in the air).
- **K web strike** pulls enemies towards you. **K in the air** is a web bomb that webs everyone around you.

## 🦸 Agents (press V)
Five original tactical heroes. Each has 3 abilities on **1 2 3** with cooldowns, and an **ultimate** on **4 / G** (6 points, earned from takedowns).
| Agent | Role | 1 | 2 | 3 | Ultimate |
|---|---|---|---|---|---|
| BLAZE | Duelist | Firewall | Heat Dash | Flashpoint | Inferno |
| VOLT | Duelist | Blink | Arc Chain | Static Field | Thunderstrike |
| HAZE | Controller | Smoke Dome (hides you from cops) | Toxic Orb | Phase Step | Night Veil (clears wanted) |
| AEGIS | Sentinel | Sentry turret | Barrier | Nano Heal (fixes your car too) | Lockdown |
| ECHO | Initiator | Recon Pulse | Shock Dart | Grapple (zip onto roofs) | Hunter's Sight |
- **Agent select** shows a live 3D preview with an orbiting camera, role cards and ability descriptions, then plays a LOCKED IN animation
- An ability HUD with cooldown sweeps, key labels and a glowing ult when it's ready; ultimates play a splash banner

## 🏢 Property empire (press B, or the Empire app on the phone)
There are 14 properties around the city (5 homes and 9 businesses). Each one has a floating holo sign showing FOR SALE or OWNED.
- **Businesses** earn income every in-game hour into a safe. You can upgrade them to level 5 (up to 5× income), hire a manager who auto-deposits the income, or sell them.
- **Homes** let you sleep (skip to morning), save and heal. The Villa and Penthouse come with free cars.
- **Perks:**
  - Car Wash: free repair and respray, and the cops lose you.
  - Chop Shop: sell the car you're driving.
  - Logistics: courier jobs pay double.
  - Nightclub: the cops forget you faster downtown.
- **Raids:** gangs attack your businesses. Defend them within 2:30 for a bonus, or they empty the safe.
- **Empire ranks** from Street Hustler up to Bay Baron, net worth tracking, and remote "collect all" (10% fee)

## 🎮 Controls you can edit
- Open it from Pause, then CONTROLS (or the help screen, then CUSTOMIZE KEYS). Every action has 2 key slots: click one, then press a key. Conflicting keys are swapped automatically, and Backspace clears a slot.
- Mouse sensitivity, invert Y, and controller rumble are all saved.
- **Controller support:** L-stick move, R-stick camera, RT/LT gas/brake, A jump, B car, X punch, Y special, RB interact, LB Crimson suit, D-pad abilities.
- New keys: **X** Crimson suit · **V** agent select · **1–4** abilities · **B** Empire · **O** photo mode · **Z** cancel job (moved from X)
- `python tests/features_test.py`: 26/26 checks

## Tests
- `python tests/campaign_test.py`: builds all 100 missions and autoplays every one in Chrome (last run: **100/100 passed, 0 JS errors**)
- `python tests/visual_test.py`: screenshots of the spectacle and mission UI in `screenshots/`

## Controls
`WASD` drive/walk · `Shift` nitro/run · `Space` handbrake · `F` enter/exit/carjack · `E` interact · `H` horn ·
`Q` radio · `M` map · `P` phone · `R` flip around · `X` cancel job · mouse wheel zoom · `Esc` pause

On foot: `Space` jump (hold in air = swing as Spindle, hold on ground = charge as Nova) · `LMB`/`J` punch · `RMB`/`K` special ·
`C` change suit · click the game to look around with the mouse (or drag with the right button)

## Tests
`python tests/play_test.py`, `python tests/systems_test.py` and `python tests/heroes_test.py` play the game in real Chrome (Playwright) and save screenshots to `screenshots/`.

## 📱 iPhone / iPad (mobile version)

The game detects touch screens automatically and switches to a mobile layout:
- **Left thumb:** a floating joystick. Push all the way to sprint.
- **Right thumb:** drag to look; tap to punch.
- **Buttons:** JUMP / SWING, PUNCH, POWER, RUN / NITRO, USE, CAR / EXIT. The agent ability buttons 1·2·3·ULT appear when you play as an agent.
- **Top row:** Map, Phone, Empire, Crimson suit, Agents, Suits, Radio, Menu. A **✕ BACK** button closes any menu.
- The HUD scales down for small screens, and a "rotate your phone" screen shows in portrait mode.
- Graphics are lighter on phones: lower resolution, smaller shadow maps, fewer cars and people.

**Play on your iPhone now:** run `python serve_mobile.py` on your PC. Open the printed `http://<pc-ip>:8004` in Safari on your iPhone (same Wi-Fi), then tap **Share → Add to Home Screen**. It runs full-screen with its own icon.
**Native App Store build:** see `../neon-bay-ios/README.md`. Building it needs a Mac with Xcode.
**Test on desktop:** open `index.html?touch=1` to force the touch layout. `tests/mobile_test.py` emulates an iPhone and runs 18 checks.
