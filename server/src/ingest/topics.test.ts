import { describe, it, expect } from 'vitest';
import { classifyTopics } from './topics';

const c = (topicLabel: string | null, tags: string[] = [], title = '') =>
  classifyTopics({ topicLabel, tags, title });

describe('classifyTopics', () => {
  it.each([
    ['AD users/groups', ['ad-gpo']],
    ['GPO basics', ['ad-gpo']],
    ['M365/Entra licensing', ['m365-entra']],
    ['Intune enrollment', ['intune']],
    ['PowerShell reporting', ['powershell']],
    ['Linux permissions', ['linux']],
    ['Windows troubleshooting, real-world', ['windows-troubleshooting']],
  ])('maps "%s"', (label, expected) => {
    expect(c(label)).toEqual(expected);
  });
  it('falls back to tags and title only when the label matches nothing', () => {
    expect(c(null, [], 'DNS and DHCP scopes')).toEqual(['dns-dhcp']);
    expect(c('Misc', ['Docker'], 'x')).toEqual(['docker']);
  });
  it('prefers the label over the title', () => {
    expect(c('Linux permissions', [], 'Active Directory tie-in')).toEqual(['linux']);
  });
  it('returns other when nothing matches', () => {
    expect(c('Soft skills', [], 'Communication')).toEqual(['other']);
  });
});
