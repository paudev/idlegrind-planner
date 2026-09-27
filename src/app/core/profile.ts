import type { PlannerProfile } from '../types';
import { readJson, writeJson } from './storage';

const ACTIVE_PROFILE_KEY = 'idlegrind-planner-active-profile-v1';

function savedProfile(): PlannerProfile {
  const saved = readJson<{ profile?: string }>(ACTIVE_PROFILE_KEY, {});
  return saved.profile === 'robinhood' ? 'robinhood' : 'solana';
}

let selectedProfile: PlannerProfile = savedProfile();

export function activeProfile(): PlannerProfile {
  return selectedProfile;
}

// Preserve the original storage keys as Solana's profile so existing users keep
// their data without a destructive migration.
export function profileStorageKey(key: string, profile: PlannerProfile = selectedProfile): string {
  return profile === 'solana' ? key : `${key}-robinhood`;
}

export function selectProfile(profile: PlannerProfile): void {
  selectedProfile = profile;
  writeJson(ACTIVE_PROFILE_KEY, { profile });
}
