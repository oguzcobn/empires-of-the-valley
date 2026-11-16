# Living city implementation review

Branch: `feat/living-city-performance`

## Behavior

- The existing 2D view remains the default. Medium 3D quality no longer enables depth-of-field or shadows. Ultra retains depth-of-field without multisample render targets; render resolution is capped at 1.5. Auto quality falls back to 2D after sustained low FPS at the lowest quality, retaining the same game state.
- Dedicated procedural hospital, police station, market, factory, hotel, club, restaurant and 8×4 airport models are available in both renderers. The catalog includes names, requirements, costs, staffing and service effects. Forecourts remain inside footprints so existing buildings do not expand into neighbouring saves.
- City journeys are deterministic saved simulation state. Shopping and hospitality visits reserve one of three parking spaces and progress through driving, parking, walking inside, a visit, walking back and returning. Police, ambulance and delivery vehicles originate at their service buildings. Up to 24 journeys are active at once. Roads are searched only when scheduling a journey, never every animation frame.
- Service vehicles require staff, connected buildings and an asphalt/bridge route. Removing a required road or building cancels the journey. Emergency vehicle lights respect reduced motion and pause settings. Hospitals have two visible ambulance parking spaces.
- Airports reserve their own runway for one flight at a time, with landing, taxi-in, terminal, taxi-out and takeoff phases. Scheduling requires an operating airport, accommodation and 1 gold. Arrivals admit at most eight passengers, bounded by accommodation and available food, and credit revenue once. Flight totals and city-service accounting appear in the building inspector.
- The 2D bridge carriageway now uses the bank elevation, asphalt visually connects to bridge approaches, and ambient cars can cross bridges. Existing 3D shared road-edge heights remain in use.
- Legacy saves do not require a new city-life field. New saves validate journey bounds, parking slots and flight phases.

## Verification

Automated coverage includes shopping lifecycle and parking reservations; bridge pathfinding and disconnected roads; removal of staff; flight scheduling, charging and arrivals; deterministic save round-trips; corrupt route-index rejection; legacy saves; procedural building art and all-culture 3D model bounds.

A Playwright scenario is included for both renderers at 844×390 and 390×844. It constructs a serviced city, advances the actual simulation, checks completed trips and flights, captures images, and collects frame timing samples. The pull-request workflow is configured to run it alongside the existing mobile tests.

The complete existing-and-new unit suite passed: 37 files, 210 tests. Lint and production build also passed. After the final parking fix, lint and build passed again; all 15 targeted city-life and road-visual tests passed, including the additional shared-parking regression test.

## Remaining verification gates

Local Chromium could not start: the environment rejected its Unix socket creation with `Operation not permitted`. Therefore no browser screenshot, measured FPS improvement, iPhone performance claim, or completed visual acceptance is asserted.

The user explicitly approved uploading this branch and opening a draft PR. Browser workflow results and screenshots must be reviewed before proposing live deployment. Nothing has been merged or deployed.

The simulation uses bounded representative trips rather than one independently simulated resident per population unit. Ambulance trips are scheduled service visits; a detailed disease/emergency model is outside this implementation. Flights are automatically queued passenger operations, not player-owned aircraft manufacturing. These distinctions keep the current game rules and performance budget explicit.
