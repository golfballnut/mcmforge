# visual-bug-fix: Reference & Gotchas

## Common Pitfalls
- **Symptom vs root cause:** Adding `!important` instead of fixing CSS specificity — fix the root cause
- **Scope creep:** "While I'm here, let me also fix this other thing" — DON'T. One fix per PR.
- **Missing responsive check:** Always verify mobile AND desktop after CSS changes
- **Hardcoded pixels:** Use design system tokens/variables instead of `px` values
- **Skipping read:** Never edit a file you haven't read in full first

## Acceptance Criteria Template
- [ ] The visual issue from the screenshot is resolved
- [ ] No regressions to surrounding UI elements
- [ ] Changes are minimal and focused (no scope creep)
- [ ] PR description explains the problem and solution clearly
- [ ] Responsive behavior is not broken (mobile + desktop)
- [ ] No unrelated files were modified

## File Location Patterns
| Tech | Component files | Style files |
|---|---|---|
| Next.js | `app/**/*.tsx`, `components/**/*.tsx` | `*.module.css`, `globals.css` |
| Shopify | `sections/*.liquid`, `snippets/*.liquid` | `assets/*.css`, `assets/*.scss` |

## Related Skills
- `codebase-aware` — load before starting to understand file structure
- `code-review` — use to verify the fix before creating PR
