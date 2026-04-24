/**
 * Live integration test for the COO router.
 *
 * Run: npx tsx src/loops/test-coo-integration.ts
 *
 * Exercises each of the 6 meta-tag scenarios against the live Supabase instance.
 * Creates a throwaway test issue ("COO Integration Test — <timestamp>"), posts
 * a series of comments, runs the COO tick() once, verifies each expected outcome
 * via SQL, then cleans up.
 *
 * This IS the COO's first supervised live run — its G3 certification evidence.
 */
import 'dotenv/config';
//# sourceMappingURL=test-coo-integration.d.ts.map