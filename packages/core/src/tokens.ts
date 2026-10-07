// The GQL tokenizer of the gql-highlight plugin (ISO/IEC 39075 GQL), so the text pane and drawn code blocks colour text
// exactly as it does (spec §4, "colour"). Proved token for token against answers recorded from gql-highlight itself.
// `--` is not a comment here: the standard allows it, but it collides with edge patterns, and graph notes write `//`.

const KEYWORDS = new Set(`
ABS ACYCLIC ALL ALL_DIFFERENT AND ANY AS ASC ASCENDING AT BINDING BY CALL CASE CAST CATALOG
CLEAR CLONE CLOSE COMMIT CONNECTING COPY COUNT CREATE CURRENT DELETE DESC DESCENDING DESTINATION
DETACH DIRECTED DISTINCT DROP EDGE EDGES ELEMENT ELEMENTS ELSE END EXCEPT EXISTS FILTER FINISH
FIRST FOR FROM GRAPH GROUP GROUPS HAVING HOME IF IN INSERT INTERSECT IS KEEP LABEL LABELED LABELS
LAST LET LIKE LIMIT MATCH NEXT NO NODE NODES NODETACH NOT OF OFFSET ON ONLY OPTIONAL OR ORDER
OTHERWISE PARAMETER PATH PATHS PROPERTY PROJECT READ RELATIONSHIP RELATIONSHIPS REMOVE REPLACE
RESET RETURN ROLLBACK SAME SCHEMA SESSION SET SHORTEST SIMPLE SKIP SOURCE START TABLE THEN TO
TRAIL TRANSACTION TYPE UNDIRECTED UNION USE VERTEX VERTICES WALK WHEN WHERE WITH WRITE XOR YIELD
`.trim().split(/\s+/));

const TYPES = new Set(`
BIGINT BINARY BOOL BOOLEAN BYTES CHAR DATE DATETIME DECIMAL DOUBLE DURATION FLOAT FLOAT32 FLOAT64
INT INT8 INT16 INT32 INT64 INTEGER LIST LOCAL LOCAL_DATETIME LOCAL_TIME RECORD SMALLINT STRING
TIME TIMESTAMP UINT VARCHAR ZONED ZONED_DATETIME ZONED_TIME
`.trim().split(/\s+/));

const VALUES = new Set(['TRUE', 'FALSE', 'NULL', 'UNKNOWN']);

/** Keywords that are also functions when called: `count(x)`, `type(e)`. */
const CALLABLE = new Set(['ABS', 'COUNT', 'LABELS', 'TYPE']);

/** The token classes; each is coloured by a rule named `.gql-<class>` in styles.css. */
export const TOKEN_CLASSES = ['kw', 'type', 'label', 'edge', 'prop', 'string', 'value', 'comment', 'fn', 'param', 'var', 'arrow', 'op', 'punct'] as const;
export type TokenClass = (typeof TOKEN_CLASSES)[number];

/** A piece of the text, and its class; null for whitespace and anything not coloured. */
export interface Token {
  c: TokenClass | null;
  s: string;
}

type Kind = 'ws' | 'comment' | 'string' | 'quoted' | 'param' | 'number' | 'word' | 'arrow' | 'op' | 'punct' | 'other';

// Ordered: the first pattern that matches at the cursor wins.
const RULES: [Kind, RegExp][] = [
  ['ws', /\s+/y],
  ['comment', /\/\/[^\n]*/y],
  ['comment', /\/\*[\s\S]*?(?:\*\/|$)/y],
  ['string', /'(?:[^'\\\n]|\\.|'')*(?:'|$)/my],
  ['string', /"(?:[^"\\\n]|\\.|"")*(?:"|$)/my],
  ['quoted', /`(?:[^`\n]|``)*(?:`|$)/my],
  ['param', /\$[A-Za-z_][A-Za-z0-9_]*/y],
  ['number', /0x[0-9A-Fa-f]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y],
  ['word', /[A-Za-z_][A-Za-z0-9_]*/y],
  ['arrow', /<-\[|\]->|-\[|\]-|<~\[|\]~>|~\[|\]~|<->|->|<-|~>|<~/y],
  ['op', /<>|<=|>=|\|\||[=<>+\-*/%|&!~]/y],
  ['punct', /[()[\]{},;.:]/y],
  ['other', /[\s\S]/y],
];

/** Splits GQL text into tokens. Joining every token's text gives back the text exactly. */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const stack: string[] = [];   // open brackets: '(' node, '[' edge, '{' map
  let labelMode = false;        // inside a label expression after ':'
  let prev: Token | null = null;
  let i = 0;
  const top = () => stack[stack.length - 1];

  while (i < src.length) {
    let kind: Kind | null = null, text = '';
    for (const [k, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m[0].length) { kind = k; text = m[0]; break; }
    }
    let c: TokenClass | null = null;
    switch (kind) {
      case 'comment': c = 'comment'; break;
      case 'string': c = 'string'; break;
      case 'param': c = 'param'; break;
      case 'number': c = 'value'; break;
      case 'quoted':
      case 'word': {
        const up = text.toUpperCase();
        const rest = src.slice(i + text.length);
        const isCall = /^[ \t]*\(/.test(rest);
        if (labelMode && (top() === '(' || top() === '[' || stack.length === 0)) c = top() === '[' ? 'edge' : 'label';
        else if (prev && prev.s === '.') c = 'prop';
        else if (top() === '{' && /^\s*:/.test(rest)) c = 'prop';
        else if (kind === 'quoted') c = 'var';
        else if (VALUES.has(up)) c = 'value';
        else if (TYPES.has(up) && !isCall) c = 'type';
        else if (KEYWORDS.has(up) && !(isCall && CALLABLE.has(up))) c = 'kw';
        else if (isCall) c = 'fn';
        else c = 'var';
        break;
      }
      case 'arrow':
        c = 'arrow';
        if (text.endsWith('[')) stack.push('[');
        if (text.startsWith(']') && top() === '[') stack.pop();
        break;
      case 'op': c = 'op'; break;
      case 'punct': {
        c = 'punct';
        if (text === '(' || text === '[' || text === '{') stack.push(text);
        const want = ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[text];
        if (want && top() === want) stack.pop();
        break;
      }
      default: c = null;
    }

    // Label expressions: `:A`, `:A:B`, `:A|B`, `:A&B`, `:!A` — inside ( ) or [ ], not { }.
    if (kind !== 'ws' && kind !== 'comment') {
      if (text === ':' && top() !== '{') labelMode = true;
      else if (labelMode && (c === 'label' || c === 'edge' || ['|', '&', '!'].includes(text))) { /* stay in the label expression */ }
      else labelMode = false;
      prev = { c, s: text };
    }
    out.push({ c, s: text });
    i += text.length;
  }
  return out;
}
