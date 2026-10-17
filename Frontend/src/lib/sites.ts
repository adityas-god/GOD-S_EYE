import { queryOptions } from '@tanstack/react-query';
import { getSites, type SiteRow } from './sites.functions';

export type Site = SiteRow;
export const sitesQueryOptions = () =>
  queryOptions({
    queryKey: ['sites'],
    queryFn: () => getSites(),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });