import type { FastifyInstance } from 'fastify';
import { load } from 'cheerio';
import { TicketBody, type Ticket, type TicketFields } from '@lab-ledger/shared';
import type { AppContext } from '../app';
import * as repo from '../db/repo';

const SLUG_RE = /^[a-z0-9-]+$/;

const emptyFields = (): TicketFields => ({
  ticketNumber: '',
  requester: '',
  issue: '',
  impact: '',
  troubleshootingSteps: '',
  rootCause: '',
  resolution: '',
  timeToResolve: '',
  followUp: '',
});

function textFromHtml(html: string): string {
  return load(`<body>${html}</body>`)('body').text().replace(/\s+/g, ' ').trim();
}

function starterTicket(slug: string, ctx: AppContext): Ticket | null {
  const lab = repo.getLab(ctx.db, slug);
  if (!lab) return null;
  const fields = emptyFields();
  fields.issue = lab.scenarioText ?? '';
  const template = lab.sections.find((section) => section.kind === 'ticketTemplate');
  fields.troubleshootingSteps = template ? textFromHtml(template.html) : '';
  return { fields, updatedAt: null };
}

function ticketMarkdown(title: string, fields: TicketFields): string {
  const sections: [string, string][] = [
    ['Ticket #', fields.ticketNumber],
    ['Requester', fields.requester],
    ['Issue', fields.issue],
    ['Impact', fields.impact],
    ['Troubleshooting steps', fields.troubleshootingSteps],
    ['Root cause', fields.rootCause],
    ['Resolution', fields.resolution],
    ['Time to resolve', fields.timeToResolve],
    ['Follow-up', fields.followUp],
  ];
  return [`# ${title}`, ...sections.map(([heading, value]) => `## ${heading}\n\n${value.trim() || '_Not recorded_'}`)].join(
    '\n\n',
  ) + '\n';
}

export function registerTicketRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/labs/:slug/ticket', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    if (!SLUG_RE.test(slug)) return reply.code(404).send({ error: 'Lab not found' });
    const ticket = repo.getTicket(ctx.db, slug) ?? starterTicket(slug, ctx);
    return ticket ?? reply.code(404).send({ error: 'Lab not found' });
  });

  app.get('/api/labs/:slug/ticket/markdown', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const lab = SLUG_RE.test(slug) ? repo.getLab(ctx.db, slug) : null;
    if (!lab) return reply.code(404).send({ error: 'Lab not found' });
    const ticket = repo.getTicket(ctx.db, slug) ?? starterTicket(slug, ctx)!;
    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${slug}-ticket.md"`);
    return ticketMarkdown(lab.title, ticket.fields);
  });

  app.put('/api/labs/:slug/ticket', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const fields = TicketBody.parse(req.body);
    if (!SLUG_RE.test(slug) || !repo.getLab(ctx.db, slug)) {
      return reply.code(404).send({ error: 'Lab not found' });
    }
    return repo.putTicket(ctx.db, slug, fields, ctx.now().toISOString());
  });
}
