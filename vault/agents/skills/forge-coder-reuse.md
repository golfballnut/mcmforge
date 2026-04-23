# Note: Map Rendering Expert is the Coder

The `DirtSync Map Rendering Expert` agent (`fce43183-9464-47d5-8724-c7d4866d7074`) has `metadata.factory_stage = 'coder'` and implements the [Forge Coder](./forge-coder.md) skill.

No separate "DirtSync Stage Coder" agent is seeded. Every stage agent (Spec/Test Runner/Fixer/Visual Critic/Shipper) pairs with the existing Map Rendering Expert — the MRE's existing skills (`waze-parity-screen-ship`, `gold-star-testing`, `dirtsync-frameworks`) plus the new `forge-coder` skill give it the full stage-appropriate context without a redundant agent row.

CEO pulls dispatch routing via the `factory_stage` metadata field; Map Rendering Expert is the resolved target for `coder` stage runs.
