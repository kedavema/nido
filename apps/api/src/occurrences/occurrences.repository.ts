import type { OccurrenceListFilters, OccurrenceRecord } from './occurrence.js';

export const OCCURRENCES_REPOSITORY = Symbol('OCCURRENCES_REPOSITORY');

export interface OccurrencesRepository {
  list(householdId: string, filters: OccurrenceListFilters): Promise<readonly OccurrenceRecord[]>;
}
