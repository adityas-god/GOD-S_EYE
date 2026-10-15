import { queryOptions } from '@tanstack/react-query';
import { getSites, type SiteRow } from './sites.functions';

export type Site = SiteRow;
export const sitesQueryOptions = () => queryOptions({ queryKey: ['sites'], queryFn: () => getSites(), staleTime: 60_000 });