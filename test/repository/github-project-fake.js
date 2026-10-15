// A stand-in for the gh command, holding a small GitHub in memory: labels, issues and one project. It answers the calls
// the GitHub mirror makes the way GitHub does (including a new project’s built-in Status field, and a field’s options
// being given new ids when they are replaced, and the fields that are not a single choice: dates, numbers and iterations),
// records every call, and says which of them changed something. Test code only — nothing here ships, and nothing here
// touches the network.
const flag = (args, name) => args[args.indexOf(name) + 1];
const flagsOf = (args, name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const json = (value) => `${JSON.stringify(value)}\n`;

/**
 * An empty GitHub for the repository `owner/name`, with `login` signed in (`app/<name>` for a GitHub App, as gh gives a
 * bot's login). `pageSize` makes the project’s item list page; `now` is the time an issue is closed at. Like gh, it refuses an issue or label call that names no repository or another one, and a project call that
 * names no owner or another one: a call that would reach the wrong place throws instead.
 */
export function fakeGithub({
  owner = 'rogerbucks',
  name = 'graph-note',
  login = owner,
  pageSize = 100,
  now = '2026-10-15T09:30:00Z',
} = {}) {
  const hub = {
    repo: `${owner}/${name}`,
    login,
    now,
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

  // a field as GitHub's GraphQL gives it: a single choice with its options, or a typed one with its data type
  const fieldNode = (f) =>
    f.options
      ? { id: f.id, name: f.name, options: f.options }
      : {
          id: f.id,
          name: f.name,
          dataType: f.dataType,
          ...(f.dataType === 'ITERATION'
            ? { configuration: { iterations: f.iterations, completedIterations: [] } }
            : {}),
        };
  // an item's value under the key GitHub gives that type of field
  const valueNode = (p, name, value) => {
    const type = p.fields.find((f) => f.name === name)?.dataType ?? 'SINGLE_SELECT';
    const key = { DATE: 'date', NUMBER: 'number', ITERATION: 'title' }[type] ?? 'name';
    return { [key]: value, field: { name } };
  };
  // an iteration field's configuration, refused as GitHub refuses an input key its schema does not hold (the keys are
  // the schema's, as the owner read them on 15 Oct 2026, so a drift fails a test); an iteration given an id keeps it
  const refuseKeys = (what, value, allowed) => {
    for (const key of Object.keys(value))
      if (!allowed.includes(key)) throw new Error(`gh: InputObject '${what}' doesn't accept argument '${key}'`);
  };
  const iterationsOf = (config) => {
    refuseKeys('ProjectV2IterationFieldConfigurationInput', config, ['startDate', 'duration', 'iterations']);
    return config.iterations.map((iteration) => {
      refuseKeys('ProjectV2Iteration', iteration, ['id', 'title', 'startDate', 'duration']);
      const { id, title, startDate, duration } = iteration;
      return { id: id ?? nextId('iter'), title, startDate, duration };
    });
  };

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
            fields: { nodes: [{ id: 'title', name: 'Title', dataType: 'TITLE' }, ...p.fields.map(fieldNode)] },
            items: {
              pageInfo: { hasNextPage: end < p.items.length, endCursor: String(end) },
              nodes: slice.map((item) => ({
                id: item.id,
                content: item.number ? { number: item.number } : {},
                fieldValues: {
                  nodes: [{}, ...Object.entries(item.values).map(([f, value]) => valueNode(p, f, value))],
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
      if (p.fields.some((f) => f.name === variables.name)) throw new Error('createProjectV2Field: the name is taken');
      const type = variables.type ?? 'SINGLE_SELECT';
      const created =
        type === 'SINGLE_SELECT'
          ? { id: nextId('fld'), name: variables.name, options: freshOptions(variables.options) }
          : { id: nextId('fld'), name: variables.name, dataType: type };
      if (type === 'ITERATION') created.iterations = iterationsOf(variables.iterations);
      p.fields.push(created);
      return json({ data: { createProjectV2Field: { projectV2Field: { id: created.id, name: created.name } } } });
    }
    if (/updateProjectV2Field/.test(query)) {
      const p = hub.projects.find((x) => x.fields.some((f) => f.id === variables.field));
      const f = p.fields.find((x) => x.id === variables.field);
      mutate([...args, 'updateProjectV2Field', f.name]);
      if (variables.iterations) {
        // an iteration kept by its id keeps its items' values; an item whose iteration went loses its value
        f.iterations = iterationsOf(variables.iterations);
        for (const item of p.items)
          if (item.values[f.name] !== undefined && !f.iterations.some((i) => i.title === item.values[f.name]))
            delete item.values[f.name];
        return json({ data: { updateProjectV2Field: { projectV2Field: { id: f.id, name: f.name } } } });
      }
      f.options = freshOptions(variables.options);
      for (const item of p.items) delete item.values[f.name];
      return json({ data: { updateProjectV2Field: { projectV2Field: f } } });
    }
    if (/repositoryOwner\(login: \$owner\) \{ id \}/.test(query))
      return json({ data: { repositoryOwner: variables.owner === owner ? { id: `OWNER_${owner}` } : null } });
    if (/issue\(number: \$number\)/.test(query)) {
      const there = variables.owner === owner && issue(variables.number);
      return json({ data: { repository: { issue: there ? { id: `ISSUE_${variables.number}` } : null } } });
    }
    if (/createProjectV2\(/.test(query)) {
      if (variables.owner !== `OWNER_${owner}`) throw new Error('createProjectV2: names no owner, or the wrong one');
      mutate([...args, 'createProjectV2', variables.title]);
      const created = {
        number: hub.projects.length + 1,
        id: nextId('PVT'),
        title: variables.title,
        fields: [field('Status', ['Todo', 'In Progress', 'Done'])],
        items: [],
      };
      hub.projects.push(created);
      const { id, number, title } = created;
      return json({ data: { createProjectV2: { projectV2: { id, number, title } } } });
    }
    if (/addProjectV2ItemById\(/.test(query)) {
      mutate([...args, 'addProjectV2ItemById', variables.content]);
      const p = hub.projects.find((x) => x.id === variables.project);
      const number = Number(variables.content.replace('ISSUE_', ''));
      // adding an issue twice gives the item it already has, as GitHub does
      const item = p.items.find((x) => x.number === number) ?? { id: nextId('item'), number, values: {} };
      if (!p.items.includes(item)) p.items.push(item);
      return json({ data: { addProjectV2ItemById: { item: { id: item.id } } } });
    }
    if (/projectsV2\(/.test(query)) {
      // the owner’s projects, a hundred to the page, found by the owner’s login whether it is a user or an organization
      if (variables.owner !== owner) return json({ data: { repositoryOwner: null } });
      const start = variables.after ? Number(variables.after) : 0;
      const nodes = hub.projects.slice(start, start + 100).map(({ id, number, title }) => ({ id, number, title }));
      const end = start + nodes.length;
      const pageInfo = { hasNextPage: end < hub.projects.length, endCursor: String(end) };
      return json({ data: { repositoryOwner: { projectsV2: { pageInfo, nodes } } } });
    }
    if (variables.owner !== owner) return json({ data: { repositoryOwner: null } });
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
    if (group === 'issue' && verb === 'list') {
      // only the issues one author (or one GitHub App, whose login gh gives as app/<name>) wrote when asked for
      const author = args.includes('--app') ? `app/${flag(args, '--app')}` : flag(args, '--author');
      const asked = args.includes('--author') || args.includes('--app');
      return json(hub.issues.filter((i) => !asked || i.author?.login === author));
    }
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
        author: { login: hub.login, ...(hub.login.startsWith('app/') ? { is_bot: true } : {}) },
        url: `https://github.com/o/r/issues/${number}`,
        closedAt: null,
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
      const target = issue(args[2]);
      target.state = verb === 'close' ? 'CLOSED' : 'OPEN';
      target.closedAt = verb === 'close' ? hub.now : null;
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
      const values = p.items.find((x) => x.id === flag(args, '--id')).values;
      if (args.includes('--clear')) delete values[f.name];
      else if (f.dataType === 'DATE') values[f.name] = flag(args, '--date');
      else if (f.dataType === 'NUMBER') values[f.name] = Number(flag(args, '--number'));
      else if (f.dataType === 'ITERATION') {
        const iteration = f.iterations.find((i) => i.id === flag(args, '--iteration-id'));
        if (!iteration) throw new Error('item-edit: no such iteration, the id is stale');
        values[f.name] = iteration.title;
      } else {
        const option = f.options.find((o) => o.id === flag(args, '--single-select-option-id'));
        if (!option) throw new Error('item-edit: no such option, the id is stale');
        values[f.name] = option.name;
      }
      return json({ id: flag(args, '--id') });
    }
    if (group === 'api' && verb === 'graphql') return graphql(args, input);
    throw new Error(`fake gh does not know: ${args.join(' ')}`);
  };

  return { hub, run };
}
