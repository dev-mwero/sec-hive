/**
 * Query type enforcement.
 *
 * The largest realistic risk in a multi-tenant app is a `findOne` that forgets
 * `organizationId`. Review cannot reliably catch it, so it is made a *build error* instead.
 *
 * `OrgFilter<T>` is `QueryFilter<T>` minus `organizationId`, with `organizationId` re-added as
 * required. Every service read signature accepts `OrgFilter`, so:
 *
 * ```ts
 * await Station.findOne({ name: "Main Gate" });        // ✗ does not compile
 * await Station.findOne({ name: "Main Gate", organizationId: orgId });  // ✓
 * ```
 *
 * `ScopedFilter<T>` goes further for client users: it also requires the scope key
 * (`clientId` or `siteId`), so a client-scoped read cannot be written without its scope.
 *
 * Note: Mongoose 9 renamed `RootFilterQuery` to `QueryFilter`.
 */

import type { QueryFilter, UpdateQuery } from "mongoose";

type WithOrganizationId<T> = Omit<T, "organizationId"> & {
  organizationId: unknown;
};

export type OrgFilter<T> = Omit<QueryFilter<T>, "organizationId"> & {
  organizationId: WithOrganizationId<T>["organizationId"];
};

export type ScopedFilter<
  T,
  SKey extends keyof WithOrganizationId<T>,
> = OrgFilter<T> & Required<Pick<WithOrganizationId<T>, SKey>>;

/** Update documents inherit the same requirement — an update cannot target a foreign row. */
export type OrgUpdate<T> = Omit<UpdateQuery<T>, "organizationId"> & {
  organizationId: WithOrganizationId<T>["organizationId"];
};

export type { QueryFilter, UpdateQuery };
