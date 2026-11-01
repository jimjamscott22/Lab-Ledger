import { describe, expect, it } from 'vitest';
import type { Ticket, TicketFields } from '@lab-ledger/shared';
import { makeTestApp } from './testing-app';

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
