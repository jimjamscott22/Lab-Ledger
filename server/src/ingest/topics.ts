import type { RotationTopic, Topic } from '@lab-ledger/shared';

const RULES: [RotationTopic, RegExp][] = [
  ['ad-gpo', /\b(ad|active directory|gpo|group policy|domain controller)\b/i],
  ['m365-entra', /\b(entra|m365|microsoft 365|office 365|graph|azure ad)\b/i],
  ['intune', /\b(intune|mdm|autopilot|endpoint manager)\b/i],
  ['windows-troubleshooting', /\b(windows|troubleshoot\w*|bsod|event viewer)\b/i],
  ['powershell', /\b(powershell|pwsh)\b/i],
  ['linux', /\b(linux|ubuntu|bash|chmod)\b/i],
  ['networking', /\b(network\w*|tcp|vlan|subnet\w*|ping)\b/i],
  ['dns-dhcp', /\b(dns|dhcp)\b/i],
  ['backups', /\b(backup\w*|restore|recovery)\b/i],
  ['security-hardening', /\b(hardening|security|bitlocker|firewall|mfa)\b/i],
  ['ticket-writeups', /\b(ticket\w*|write-?up)\b/i],
  ['docker', /\b(docker|container\w*|compose)\b/i],
];

const match = (text: string): RotationTopic[] => RULES.filter(([, re]) => re.test(text)).map(([t]) => t);

export function classifyTopics(input: {
  topicLabel: string | null;
  tags: string[];
  title: string;
}): Topic[] {
  const fromLabel = input.topicLabel ? match(input.topicLabel) : [];
  if (fromLabel.length) return fromLabel;
  const fromRest = match(`${input.tags.join(' ')} ${input.title}`);
  return fromRest.length ? fromRest : ['other'];
}
