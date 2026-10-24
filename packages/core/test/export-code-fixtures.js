// What the export-to-code tests share (editor spec §38). A small graph of a mailing process, as a note holds it. Test
// support only — nothing here ships.
import gs from '@thoughtknot/graph-spec';

export const MAILER = `// graph: mailer
(welcome:Step {name: 'Send the welcome email', action: 'send email', to: 'new member'}),
(check:Step {name: 'Check the address', likelihood: 'unlikely'}),
(budget:Rule {name: 'Monthly budget', status: 'contested'}),
(smtp:SecretRef {name: 'SMTP_PASSWORD', from: 'env'}),
(check)-[:THEN]->(welcome),
(welcome)-[:USES_SECRET]->(smtp)`;

/** The one graph a GQL text holds. */
export const graphOf = (text = MAILER) => Object.values(gs.worldFromStore(gs.read([text])))[0];

export const CONFIRM = { by: 'roger', version: 'v1', at: '2026-10-24T09:00:00Z' };
