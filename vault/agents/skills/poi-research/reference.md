# POI Research — Reference

## Trail System Coordinates

| System | Lat | Lon | State | Nearby Towns |
|--------|-----|-----|-------|--------------|
| Bearwallow | 38.10 | -80.83 | WV | Summersville, Richwood, Canvas |
| Bergoo | 38.37 | -80.53 | WV | Webster Springs, Bergoo |
| Big Coal | 37.96 | -81.47 | WV | Whitesville, Boone County |
| Braveheart | 37.83 | -81.93 | WV | Fort Gay, Wayne County |
| Buffalo Mountain | 37.68 | -81.67 | WV | Accoville, Man, Logan |
| Burning Rock | 37.73 | -81.35 | WV | Sophia, Beckley, Ghent |
| Cabwaylingo | 38.24 | -82.30 | WV | Dunlow, Wayne County |
| Devil Anse | 37.72 | -81.85 | WV | Gilbert, Mingo County |
| East Lynn | 38.17 | -82.37 | WV | East Lynn, Wayne County |
| Hillbilly/Tornado | 37.86 | -81.67 | WV | Chapmanville, Logan County |
| Indian Ridge | 37.61 | -81.70 | WV | Pineville, Wyoming County |
| Ivy Branch | 37.97 | -81.15 | WV | Lookout, Fayette County |
| Pinnacle Creek | 37.59 | -81.60 | WV | Pineville, Mullens |
| Pocahontas | 37.42 | -81.50 | WV | Bramwell, Bluefield |
| Rockhouse | 37.56 | -81.77 | WV | Gilbert, Mingo County |
| Warrior | 38.27 | -81.33 | WV | Belle, Boone County |
| Spearhead Trails | 37.01 | -82.13 | VA | Grundy, Haysi, Breaks |
| Breaks Mountain | 37.29 | -82.29 | VA/KY | Breaks, Elkhorn City |

## POI Types (Priority Order)

1. Gas stations / fuel stops
2. Restaurants / food (fast food, sit-down, convenience)
3. Lodging — hotels & motels
4. Lodging — cabins & vacation rentals (Airbnb, VRBO, B&Bs)
5. Lodging — campgrounds & RV parks
6. Gear shops / ATV dealers / rental shops
7. Trailheads / parking / staging areas
8. Emergency services (hospitals, urgent care, police)
9. Grocery / convenience stores
10. Liquor / beer stores
11. Tow / recovery services
12. Auto parts stores
13. Laundromats
14. Car washes / pressure wash
15. Pharmacies
16. Banks / ATMs
17. Scenic overlooks / landmarks

## Required Data Columns

| Column | Required |
|--------|----------|
| Trail System | Yes |
| POI Name | Yes |
| Type | Yes |
| Latitude | Yes |
| Longitude | Yes |
| Distance (mi) | Yes |
| Address | Yes |
| Phone | If available |
| Email | If available |
| Rating | If available |
| Hours | If available |
| ATV Friendly | Best effort |
| Notes | If relevant |
| Source | Yes |
| Also Near | If applicable |

## Distance Thresholds

- Default radius: 10 miles from trail system center
- Dedup threshold: 0.001 degrees (~0.07 miles) = same POI
- Coordinates: business-level precision required, NOT city centroid

## Infrastructure

- DirtSync Supabase: `lldipxvwocpqncixlnxj`
- DirtSync/POI Data/ Drive folder: `18qQk2kQRHEb45ze_oxMNU_fzr_aiiLDh`
- workspace-mcp path: `$HOME/.local/bin/uvx workspace-mcp`
- Google email: `dirtsyncapp@gmail.com`
