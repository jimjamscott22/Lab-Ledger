import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Ticket, TicketFields } from '@lab-ledger/shared';
import { makeTestApp } from './testing-app';
import { SAMPLE_LAB_FILE, SAMPLE_LAB_HTML } from './ingest/regression-sample';

const completeTicket: TicketFields = {
  ticketNumber: 'INC-1042',
  requester: 'Alex',
  issue: 'Laptop does not wake from sleep.',
  impact: 'User cannot start work.',
  troubleshootingSteps: 'Checked power plan and wake-capable devices.',
  rootCause: 'USB power management disabled wake.',
  resolution: 'Enabled wake for the keyboard.',
  timeToResolve: '35 minutes',
  followUp: 'Check in tomorrow.',
};

describe('ticket API', () => {
  it('prefills a new ticket from the lab scenario and ticket template', async () => {
    const { app } = await makeTestApp();
    const response = await app.inject('/api/labs/windows-wont-wake-from-sleep/ticket');
    expect(response.statusCode).toBe(200);
    const ticket = response.json() as Ticket;
    expect(ticket.updatedAt).toBeNull();
    expect(ticket.fields.issue).toContain('User reports a problem');
    expect(ticket.fields.troubleshootingSteps).toContain('Issue, Impact, Root cause, Resolution');
  });

  it('prefills the issue with one line per block element', async () => {
    const { app, ctx, labsDir } = await makeTestApp();
    fs.writeFileSync(path.join(labsDir, SAMPLE_LAB_FILE), SAMPLE_LAB_HTML);
    ctx.ingest.rescan();
    const ticket = (await app.inject('/api/labs/sample-onboarding/ticket')).json() as Ticket;
    expect(ticket.fields.issue).toBe(
      'Skill: Create users with the ActiveDirectory PowerShell module.\n' +
        'Ticket #10423 – Priority: Normal\n' +
        '"Hi IT, our new hire Taylor Reed starts Monday."',
    );
  });

  it('saves and reloads every ticket field', async () => {
    const { app } = await makeTestApp();
    const put = await app.inject({
      method: 'PUT',
      url: '/api/labs/windows-wont-wake-from-sleep/ticket',
      payload: completeTicket,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ fields: completeTicket });
    expect((await app.inject('/api/labs/windows-wont-wake-from-sleep/ticket')).json()).toMatchObject({
      fields: completeTicket,
    });
    const markdown = await app.inject('/api/labs/windows-wont-wake-from-sleep/ticket/markdown');
    expect(markdown.headers['content-disposition']).toContain('windows-wont-wake-from-sleep-ticket.md');
    expect(markdown.body).toContain('## Root cause\n\nUSB power management disabled wake.');
  });

  it('rejects malformed input and unknown labs', async () => {
    const { app } = await makeTestApp();
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/labs/ad-user-onboarding/ticket',
          payload: { ...completeTicket, issue: 42 },
        })
      ).statusCode,
    ).toBe(400);
    expect((await app.inject('/api/labs/nope/ticket')).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/labs/nope/ticket',
          payload: completeTicket,
        })
      ).statusCode,
    ).toBe(404);
  });
});
