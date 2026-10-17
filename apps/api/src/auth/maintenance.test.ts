import { describe, expect, it } from 'vitest';
import { devFixtureTarget, localMaintenanceTarget } from './maintenance.js';
describe('development fixture safeguards', () => {
  const options = {
    NODE_ENV: 'development',
    ALLOW_DEV_FIXTURES: 'I_UNDERSTAND_THIS_IS_DISPOSABLE',
    DEV_FIXTURE_DATABASE_URL: 'postgresql://fixture@127.0.0.1:5432/pommier_dev',
  };
  it('requires explicit development opt-in and a separate local dev database', () => {
    expect(
      localMaintenanceTarget('postgresql://fixture@127.0.0.1:5432/pommier_dev?schema=public')
        .hostname,
    ).toBe('127.0.0.1');
    for (const query of [
      'host=remote.example',
      'port=5433',
      'schema=other',
      'options=-csearch_path%3Dother',
    ])
      expect(() =>
        localMaintenanceTarget(`${options.DEV_FIXTURE_DATABASE_URL}?${query}`),
      ).toThrow();
    expect(devFixtureTarget(options)).toBe(options.DEV_FIXTURE_DATABASE_URL);
    expect(() => devFixtureTarget({ ...options, NODE_ENV: 'production' })).toThrow();
    expect(() =>
      devFixtureTarget({ ...options, DEV_FIXTURE_DATABASE_URL: 'https://localhost/pommier_dev' }),
    ).toThrow();
    expect(() => devFixtureTarget({ ...options, ALLOW_DEV_FIXTURES: '' })).toThrow();
    expect(() =>
      devFixtureTarget({
        ...options,
        DEV_FIXTURE_DATABASE_URL: 'postgresql://user@remote.example/pommier_dev',
      }),
    ).toThrow();
    expect(() =>
      devFixtureTarget({
        ...options,
        DEV_FIXTURE_DATABASE_URL: 'postgresql://fixture@localhost/le_pommier',
      }),
    ).toThrow();
    expect(() =>
      devFixtureTarget({
        ...options,
        DATABASE_URL: 'postgresql://other@localhost:5432/pommier_dev',
      }),
    ).toThrow();
    expect(() =>
      devFixtureTarget({
        ...options,
        DATABASE_URL: 'postgresql://other@localhost:5432/%70ommier_dev',
      }),
    ).toThrow();
  });
});
