# TOOLS.md — DirtSync Social Riding Engineer

Reference patterns for RiderBeacon, Supabase Realtime, friend dots, APNs, and rally points. Read sections on demand — do not load all of this upfront.

---

## 1. Supabase Table Migrations (Reference Only — Do Not Auto-Run)

These are the canonical schemas. Apply via `mcp__supabase__apply_migration` when the tables do not yet exist.

### rider_beacons

```sql
CREATE TABLE IF NOT EXISTS public.rider_beacons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat           DOUBLE PRECISION NOT NULL,   -- rounded to 5 decimals at service layer
  lng           DOUBLE PRECISION NOT NULL,   -- rounded to 5 decimals at service layer
  heading       DOUBLE PRECISION,            -- degrees, 0-360, nullable
  speed         DOUBLE PRECISION,            -- m/s, nullable
  ride_id       UUID,                        -- nullable — null means exploring, not on a ride
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per user, upserted on every update
CREATE UNIQUE INDEX IF NOT EXISTS rider_beacons_user_id_idx ON public.rider_beacons(user_id);

-- TTL enforcement: rows older than 30s are considered offline
-- Application layer checks: now() - updated_at > 30s → treat as offline

-- RLS
ALTER TABLE public.rider_beacons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all beacons"
  ON public.rider_beacons FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can upsert their own beacon"
  ON public.rider_beacons FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own beacon"
  ON public.rider_beacons FOR UPDATE
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own beacon"
  ON public.rider_beacons FOR DELETE
  TO authenticated USING (user_id = auth.uid());
```

### rally_points

```sql
CREATE TABLE IF NOT EXISTS public.rally_points (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  name              TEXT NOT NULL,
  meeting_time      TIMESTAMPTZ,             -- nullable — can be "whenever"
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'creator_left', 'ended')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rally_points_status_idx ON public.rally_points(status);
CREATE INDEX IF NOT EXISTS rally_points_creator_idx ON public.rally_points(creator_user_id);

-- RLS
ALTER TABLE public.rally_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active rally points"
  ON public.rally_points FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can create rally points"
  ON public.rally_points FOR INSERT
  TO authenticated WITH CHECK (creator_user_id = auth.uid());

CREATE POLICY "Creator can update their own rally point"
  ON public.rally_points FOR UPDATE
  TO authenticated USING (creator_user_id = auth.uid());

-- No DELETE policy — status change to 'ended' is the canonical end state
```

---

## 2. Supabase Realtime Patterns (Swift)

### Channel naming convention
```
presence:ride-<ride_id>     // when riders are on the same ride
beacon:global               // fallback — all riders in app when no shared ride
```

### RiderBeaconService.swift — canonical structure

```swift
import Foundation
import Supabase
import CoreLocation

@MainActor
final class RiderBeaconService: ObservableObject {

    static let shared = RiderBeaconService()
    private var channel: RealtimeChannelV2?
    private var lastPublish: Date = .distantPast
    private let publishInterval: TimeInterval = 5.0

    // Privacy: round to 5 decimal places (~1.1m precision)
    private func round(_ value: Double) -> Double {
        (value * 100_000).rounded() / 100_000
    }

    func onLocationUpdate(_ location: CLLocation) {
        guard Date().timeIntervalSince(lastPublish) >= publishInterval else { return }
        lastPublish = Date()

        let lat = round(location.coordinate.latitude)
        let lng = round(location.coordinate.longitude)
        let heading = location.course >= 0 ? location.course : nil
        let speed = location.speed >= 0 ? location.speed : nil

        Task {
            do {
                try await SupabaseManager.shared.client
                    .from("rider_beacons")
                    .upsert([
                        "user_id": SupabaseManager.shared.currentUserId,
                        "lat": lat,
                        "lng": lng,
                        "heading": heading as Any,
                        "speed": speed as Any,
                        "updated_at": ISO8601DateFormatter().string(from: Date())
                    ], onConflict: "user_id")
                    .execute()

                // Also broadcast on Realtime for sub-second friend dot updates
                try await channel?.broadcast(event: "beacon", message: [
                    "user_id": SupabaseManager.shared.currentUserId,
                    "lat": lat,
                    "lng": lng,
                    "heading": heading as Any
                ])
            } catch {
                // Non-fatal: beacon failure should not crash the app
                print("[RiderBeaconService] publish error: \(error)")
            }
        }
    }

    func subscribe(rideId: String?) {
        let channelName = rideId.map { "presence:ride-\($0)" } ?? "beacon:global"
        channel = SupabaseManager.shared.client.realtimeV2.channel(channelName)
        // ... subscribe and handle incoming beacons to update friend dots
    }

    func unsubscribe() {
        Task { await channel?.unsubscribe() }
        channel = nil
    }

    func clearBeacon() {
        Task {
            try? await SupabaseManager.shared.client
                .from("rider_beacons")
                .delete()
                .eq("user_id", value: SupabaseManager.shared.currentUserId)
                .execute()
        }
    }
}
```

**Key rules from this pattern:**
- Subscribe to `MapLocationManager.shared` location updates — NEVER create a new `CLLocationManager`
- Round coordinates before any write or broadcast
- `clearBeacon()` must be called on app background/foreground loss
- Broadcast failure is non-fatal — log and continue

---

## 3. Friend Dot Annotation Layer (Swift / MapLibre)

### MapCoordinator+SocialLayers.swift — canonical structure

```swift
// Called from mapViewDidFinishLoadingMap — AFTER trail layers are loaded
func addFriendDotLayer(_ mapView: MLNMapView) {
    guard mapView.style != nil else { return }  // never add before style loads

    // Source: GeoJSON FeatureCollection, updated as beacons arrive
    let source = MLNShapeSource(
        identifier: "friend-dots-source",
        shape: MLNShapeCollectionFeature(shapes: []),
        options: nil
    )
    mapView.style?.addSource(source)

    let layer = MLNCircleStyleLayer(identifier: "friend-dots-layer", source: source)
    layer.circleRadius = NSExpression(forConstantValue: 10)
    layer.circleColor = NSExpression(forConstantValue: UIColor.systemBlue)
    layer.circleStrokeWidth = NSExpression(forConstantValue: 2)
    layer.circleStrokeColor = NSExpression(forConstantValue: UIColor.white)

    // Add ABOVE all existing layers — pass nil for above to put at top
    mapView.style?.addLayer(layer)

    // Store reference for updates
    friendDotSource = source
}

func updateFriendDots(_ beacons: [RiderBeacon]) {
    guard let source = friendDotSource else { return }
    let capped = Array(beacons.prefix(20))  // max 20 friend dots
    let features = capped.map { beacon -> MLNPointFeature in
        let f = MLNPointFeature()
        f.coordinate = CLLocationCoordinate2D(latitude: beacon.lat, longitude: beacon.lng)
        f.attributes = ["user_id": beacon.userId, "heading": beacon.heading ?? 0]
        return f
    }
    source.shape = MLNShapeCollectionFeature(shapes: features)
}
```

**Z-order rule:** `addLayer` with no position argument places the layer on top of all existing layers. This is correct behavior — friend dots must appear above trail lines. Confirm by reading `MapCoordinator+TrailLayers.swift` layer names and verifying `friend-dots-layer` is not in that file.

---

## 4. APNs Push Notification Payload Templates

### Rally Point Created
```json
{
  "aps": {
    "alert": {
      "title": "Rally Point Set",
      "body": "<creator_name> set a rally point at <rally_name>"
    },
    "sound": "default",
    "badge": 1
  },
  "rally_point_id": "<uuid>",
  "event_type": "rally_created",
  "lat": 37.35178,
  "lng": -80.05421
}
```

### Rally Point Approaching (triggered at 200m radius)
```json
{
  "aps": {
    "alert": {
      "title": "Approaching Rally Point",
      "body": "You're 200m from <rally_name>"
    },
    "sound": "default"
  },
  "rally_point_id": "<uuid>",
  "event_type": "rally_approaching"
}
```

### Rally Point Ended
```json
{
  "aps": {
    "alert": {
      "title": "Rally Ended",
      "body": "<creator_name> ended the rally at <rally_name>"
    },
    "sound": "default"
  },
  "rally_point_id": "<uuid>",
  "event_type": "rally_ended"
}
```

**APNs delivery rules:**
- Check `DirtSync.entitlements` → `aps-environment` before every push test
- `development` entitlement → sandbox APNs endpoint only
- `production` entitlement → production APNs endpoint only
- Mixing them results in silent drops — no error, no delivery

---

## 5. Presence State Management Pattern

Supabase Presence tracks who is currently online. Use for "riders nearby" awareness, not for persistent beacon storage (that's the `rider_beacons` table).

```swift
// Subscribe to presence channel
let channel = client.realtimeV2.channel("presence:ride-\(rideId)")

await channel.subscribe { [weak self] state in
    guard case .subscribed = state else { return }
    // Track own presence
    try? await channel.track(state: [
        "user_id": currentUserId,
        "display_name": currentUser.displayName,
        "lat": roundedLat,
        "lng": roundedLng
    ])
}

// Handle presence changes
for await presenceChange in await channel.presenceChange() {
    // .join → new rider appeared
    // .leave → rider left (app killed or backgrounded)
    // Note: app-kill does NOT trigger .leave immediately
    // Use heartbeat_at TTL (30s) to handle silent departures
}
```

**Presence TTL pattern for force-quit handling:**
```swift
// In RiderBeaconService — heartbeat every 15s even when location unchanged
// Supabase Presence cleans up after disconnect but may take 30-60s
// Client-side: filter out beacons where updated_at < now() - 30s
let isOnline = Date().timeIntervalSince(beacon.updatedAt) < 30
```

---

## 6. Privacy Rounding — Rationale

Trail riders on technical singletrack can be located to within 1m by raw GPS. At full float precision, a beacon stream is a fingerprinting attack vector — showing exactly which line a rider took, dwell time at features, etc.

5 decimal places = ~1.1m horizontal resolution. This is sufficient to:
- Show a friend dot in the right position on the map
- Trigger "approaching" geofence at 200m radius with accuracy
- NOT reveal which specific rock the rider chose on a technical section

Apply rounding in `RiderBeaconService` before any Supabase write or Realtime broadcast. Never let raw GPS reach the network.

---

## 7. Budget Rationale

Social features involve Supabase Realtime subscriptions (not billed by query) and periodic upserts. The main agent cost is development time:
- `$1/day target` — Sonnet handles all social feature work
- `$3/day hard cap` — if hitting cap, scope is too large, break the issue into smaller tasks
- Never use Opus for this agent — Sonnet is sufficient for Swift + Supabase work
