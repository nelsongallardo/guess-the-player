// Shared test fixtures. Everything here is MOCK data: it never proves a vendor,
// account or public delivery works.

export const COMMIT = 'a'.repeat(40);
export const HEX = c => c.repeat(64);

export function validJob(overrides = {}) {
  return {
    schemaVersion: 1,
    campaignId: 'pilot-20261019',
    jobId: 'job-0001',
    assetId: '0123456789abcdef0123',
    source: {
      commit: COMMIT,
      indexSha256: HEX('1'),
      rosterSha256: HEX('2'),
      scheduleSha256: HEX('3'),
      researchSha256: HEX('4'),
    },
    career: {
      playerId: 'mock-player',
      name: 'Mock Player',
      clubs: [{ name: 'Club A', crestSha256: HEX('5') }, { name: 'Club B', crestSha256: HEX('6') }, { name: 'Club A', crestSha256: HEX('5') }],
      evidenceSources: ['https://example.org/mock-player'],
    },
    license: {
      ttsProvider: null, ttsPlan: null, ttsCommercialUse: null, voiceId: null, modelId: null, evidence: null,
      crests: 'embedded', music: 'none',
    },
    targets: [
      {
        platform: 'youtube', channelId: 'mock-yt-channel', nativeAccount: 'UCmockmockmockmockmockmo',
        publishAtUtc: '2026-10-19T16:00:00Z', privacy: 'public', madeForKids: false,
        interactions: null, disclosures: { aiGenerated: true, promotional: false },
      },
    ],
    ...overrides,
  };
}

export function validConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    enabled: true,
    buffer: {
      organizationId: 'mock-org',
      channels: [{ platform: 'youtube', channelId: 'mock-yt-channel', nativeAccount: 'UCmockmockmockmockmockmo' }],
    },
    caps: { variableUsd: 5, ttsCharacters: 2000 },
    rates: { ttsUsdPerCharacter: 0.0003 },
    hosting: { allowedHosts: ['media.example.org'] },
    tts: { authorized: true },
    ...overrides,
  };
}
