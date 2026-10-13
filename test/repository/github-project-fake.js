// A stand-in for the gh command, holding a small GitHub in memory: labels, issues and one project. It answers the calls
// the GitHub mirror makes the way GitHub does (including a new project’s built-in Status field, and a field’s options
// being given new ids when they are replaced), records every call, and says which of them changed something. Test code
// only — nothing here ships, and nothing here touches the network.
const flag = (args, name) => args[args.indexOf(name) + 1];
const flagsOf = (args, name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const json = (value) => `${JSON.stringify(value)}\n`;

/**
 * An empty GitHub for the repository `owner/name`, with `login` signed in. `pageSize` makes the project’s item list
 * page. Like gh, it refuses an issue or label call that names no repository or another one, and a project call that
 * names no owner or another one: a call that would reach the wrong place throws instead.
 */
export function fakeGithub({ owner = 'rogerbucks', name = 'graph-note', login = owner, pageSize = 100 } = {}) {
  const hub = {
    repo: `${owner}/${name}`,
    login,
    labels: [],
    issues: [],
    projects: [],
    calls: [],
    mutations: [],
    ids: 0,
  };
  const nextId = (prefix) => `${prefix}_${(hub.ids += 1)}`;
  const mutate = (args) => hub.mutations.push(args.join(' '));
  const issue = (n) => hub.issues.find((i) => i.number === Number(n));
  const project = (number) => hub.projects.find((p) => p.number === Number(number));
  const freshOptions = (options) =>
    options.map(({ name, color = 'GRAY', description = '' }) => ({ id: nextId('opt'), name, color, description }));

  const field = (name, options) => ({
    id: nextId('fld'),
    name,
    options: freshOptions(options.map((name) => ({ name }))),
  });

  const readProject = (p, after) => {
    const start = after ? Number(after) : 0;
    const slice = p.items.slice(start, start + pageSize);
    const end = start + slice.length;
    return {
      data: {
        repositoryOwner: {
          projectV2: {
            id: p.id,
            number: p.number,
            title: p.title,
            fields: { nodes: [{}, ...p.fields.map((f) => ({ id: f.id, name: f.name, options: f.options }))] },
            items: {
              pageInfo: { hasNextPage: end < p.items.length, endCursor: String(end) },
              nodes: slice.map((item) => ({
                id: item.id,
                content: item.number ? { number: item.number } : {},
                fieldValues: {
                  nodes: [{}, ...Object.entries(item.values).map(([f, name]) => ({ name, field: { name: f } }))],
                },
              })),
            },
          },
        },
      },
    };
  };

  const graphql = (args, input) => {
    const { query, variables } = JSON.parse(input);
    if (/createProjectV2Field/.test(query)) {
      mutate([...args, 'createProjectV2Field', variables.name]);
      const p = hub.projects.find((x) => x.id === variables.project);
      const created = { id: nextId('fld'), name: variables.name, options: freshOptions(variables.options) };
      p.fields.push(created);
      return json({ data: { createProjectV2Field: { projectV2Field: created } } });
    }
    if (/updateProjectV2Field/.test(query)) {
      const p = hub.projects.find((x) => x.fields.some((f) => f.id === variables.field));
      const f = p.fields.find((x) => x.id === variables.field);
      mutate([...args, 'updateProjectV2Field', f.name]);
      f.options = freshOptions(variables.options);
      for (const item of p.items) delete item.values[f.name];
      return json({ data: { updateProjectV2Field: { projectV2Field: f } } });
    }
    return json(readProject(project(variables.number), variables.after));
  };

  const run = (args, input) => {
    hub.calls.push({ args, input });
    const [group, verb] = args;
    if (group === 'repo' && verb === 'view') return json({ nameWithOwner: hub.repo });
    if (group === 'api' && verb === 'user') return json({ login: hub.login });
    if (group === 'issue' || group === 'label') {
      if (flag(args, '--repo') !== hub.repo)
        throw new Error(`gh ${group} ${verb}: names no repository, or the wrong one`);
    }
    if (group === 'project' && ['list', 'create', 'item-add'].includes(verb)) {
      if (flag(args, '--owner') !== owner) throw new Error(`gh project ${verb}: names no owner, or the wrong one`);
    }
    if (group === 'label' && verb === 'list') return json(hub.labels);
    if (group === 'label' && verb === 'create') {
      mutate(args);
      hub.labels.push({ name: args[2] });
      return '';
    }
    if (group === 'issue' && verb === 'list') return json(hub.issues);
    if (group === 'issue' && verb === 'create') {
      mutate(args);
      const number = hub.issues.length + 1;
      const labels = flagsOf(args, '--label').map((name) => ({ name }));
      hub.issues.push({
        number,
        title: flag(args, '--title'),
        body: input,
        state: 'OPEN',
        labels,
        author: { login: hub.login },
        url: `https://github.com/o/r/issues/${number}`,
      });
      return `https://github.com/o/r/issues/${number}\n`;
    }
    if (group === 'issue' && verb === 'edit') {
      mutate(args);
      const target = issue(args[2]);
      if (args.includes('--title')) target.title = flag(args, '--title');
      if (args.includes('--body-file')) target.body = input;
      for (const name of flagsOf(args, '--add-label')) target.labels.push({ name });
      const removed = new Set(flagsOf(args, '--remove-label'));
      target.labels = target.labels.filter((l) => !removed.has(l.name));
      return '';
    }
    if (group === 'issue' && (verb === 'close' || verb === 'reopen')) {
      mutate(args);
      issue(args[2]).state = verb === 'close' ? 'CLOSED' : 'OPEN';
      return '';
    }
    if (group === 'issue' && verb === 'comment') {
      mutate(args);
      (issue(args[2]).comments ??= []).push(input);
      return '';
    }
    if (group === 'project' && verb === 'list') {
      return json({ projects: hub.projects.map(({ number, title, id }) => ({ number, title, id })), totalCount: 1 });
    }
    if (group === 'project' && verb === 'create') {
      mutate(args);
      const created = {
        number: hub.projects.length + 1,
        id: nextId('PVT'),
        title: flag(args, '--title'),
        fields: [field('Status', ['Todo', 'In Progress', 'Done'])],
        items: [],
      };
      hub.projects.push(created);
      return json({ number: created.number, id: created.id, title: created.title });
    }
    if (group === 'project' && verb === 'item-add') {
      mutate(args);
      const p = project(args[2]);
      const url = flag(args, '--url');
      const item = { id: nextId('item'), number: Number(url.split('/').at(-1)), values: {} };
      p.items.push(item);
      return json({ id: item.id });
    }
    if (group === 'project' && verb === 'item-edit') {
      mutate(args);
      const p = hub.projects.find((x) => x.id === flag(args, '--project-id'));
      const f = p.fields.find((x) => x.id === flag(args, '--field-id'));
      const option = f.options.find((o) => o.id === flag(args, '--single-select-option-id'));
      if (!option) throw new Error('item-edit: no such option, the id is stale');
      p.items.find((x) => x.id === flag(args, '--id')).values[f.name] = option.name;
      return json({ id: flag(args, '--id') });
    }
    if (group === 'api' && verb === 'graphql') return graphql(args, input);
    throw new Error(`fake gh does not know: ${args.join(' ')}`);
  };

  return { hub, run };
}
