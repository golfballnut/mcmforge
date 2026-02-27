# Design Extraction Agent — Skill Doc

> Extract exact design tokens from an approved mockup image.

## When to Use
After a mockup is generated and before a builder agent starts coding. The extracted tokens become the source of truth for implementation.

## Input
- Approved mockup image (PNG/JPEG)
- Optional: current app screenshot for comparison

## Prompt Template

```
Analyze this UI mockup image and extract ALL design tokens with exact values.

Output ONLY valid JSON in this exact format:

{
  "colors": {
    "background": "#hex",
    "surface": "#hex",
    "text_primary": "#hex",
    "text_secondary": "#hex",
    "accent": "#hex",
    "border": "#hex",
    "button_primary": "#hex",
    "button_text": "#hex",
    "error": "#hex",
    "success": "#hex"
  },
  "typography": {
    "heading_font": "font-family",
    "body_font": "font-family",
    "heading_size": "px",
    "subheading_size": "px",
    "body_size": "px",
    "label_size": "px",
    "font_weight_heading": "number",
    "font_weight_body": "number"
  },
  "spacing": {
    "page_padding": "px",
    "section_gap": "px",
    "element_gap": "px",
    "card_padding": "px",
    "input_padding": "px"
  },
  "borders": {
    "radius_small": "px",
    "radius_medium": "px",
    "radius_large": "px",
    "border_width": "px",
    "border_color": "#hex"
  },
  "icons": {
    "style": "outline|filled|rounded",
    "size_small": "px",
    "size_medium": "px",
    "size_large": "px"
  },
  "layout": {
    "max_width": "px",
    "columns": "number",
    "sidebar_width": "px",
    "header_height": "px"
  }
}

Be precise. Use the actual hex values you see, not generic CSS variables.
If a value is ambiguous, make your best estimate and note it.
```

## Output Format
Structured JSON stored as `design_tokens` in the `spec_sheets` table. The builder agent reads these tokens to implement exact colors, fonts, and spacing.

## Quality Criteria
- All hex colors must be valid 6-digit hex codes
- Font sizes must be reasonable (10-72px range)
- Spacing values must be consistent (multiples of 4px preferred)
- No placeholder or generic values — extract from the actual image
