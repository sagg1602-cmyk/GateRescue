/**
 * Compatibility re-export. The operational types now live in
 * src/lib/shared/operational-types.ts, shared by the dashboard, API routes and
 * database mappers. Existing frontend imports of this module keep working;
 * new code should import from "@/lib/shared/operational-types" directly.
 */

export type * from "../shared/operational-types";
