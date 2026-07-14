import { describe, expect, it } from 'vitest';
import { PORT_NAME, PORT_VERSION } from './version';

describe('scaffold sanity', () => {
  it('exports version metadata', () => {
    expect(PORT_NAME).toContain('Skeldal');
    expect(PORT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
