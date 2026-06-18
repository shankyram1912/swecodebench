import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ============ THEME (violet-led sibling) ============ */
const C = {
  bg: "#0B0E14", panel: "#11161F", panel2: "#161D29", deep: "#0D1119",
  line: "#232B3B", text: "#E8E4D8", dim: "#8B93A7",
  violet: "#9D8CFF", violetSoft: "rgba(157,140,255,0.14)",
  cyan: "#4FC1B6", cyanSoft: "rgba(79,193,182,0.13)",
  amber: "#E8A33D", amberSoft: "rgba(232,163,61,0.14)",
  red: "#E0564B", redSoft: "rgba(224,86,75,0.15)",
  green: "#69C181", greenSoft: "rgba(105,193,129,0.14)",
};
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/* ============ PYODIDE (optional — example runner) ============ */
const PV = "0.23.4";
const PB = `https://cdnjs.cloudflare.com/ajax/libs/pyodide/${PV}/`;
let PY = null;
async function bootPy(set) {
  try {
    set("loading");
    if (!window.loadPyodide) {
      await new Promise((res, rej) => { const s = document.createElement("script"); s.src = PB + "pyodide.js"; s.onload = res; s.onerror = () => rej(); document.head.appendChild(s); });
    }
    PY = await window.loadPyodide({ indexURL: PB });
    PY.runPython(`
import sys, io, json, traceback
def _run(code):
    buf = io.StringIO(); old = sys.stdout; err = None
    try: compile(code, "<x>", "exec")
    except SyntaxError as e: return json.dumps({"out":"","err":"SyntaxError: "+str(e.msg)+" (line "+str(e.lineno)+")"})
    sys.stdout = buf
    try: exec(code, {})
    except Exception: err = traceback.format_exc().strip().split("\\n")[-1]
    finally: sys.stdout = old
    return json.dumps({"out": buf.getvalue(), "err": err})
`);
    set("ready");
  } catch { PY = null; set("failed"); }
}
async function runPy(code) {
  if (!PY) return { out: "", err: "interpreter not loaded" };
  try { PY.globals.set("code", code); return JSON.parse(PY.runPython("_run(code)")); }
  catch (e) { return { out: "", err: String(e).split("\n")[0] }; }
}

/* ============ METHOD DATA ============
   m: method   sig: signature   ret: return value   mut: true=mutates,false=returns new/value
   t: time     s: space    why: cost reasoning (both axes)   hint: plain-language one-liner
   expl: deeper when/why   ex: runnable example
*/
const STRUCTS = [
  {
    id: "list", name: "list", tag: "ordered · indexable · growable · mutable",
    methods: [
      { m: "append", sig: "lst.append(x)", ret: "None", mut: true, t: "O(1)*", s: "O(1)", why: "Amortized constant: usually writes one slot; occasionally the array is full and Python allocates a bigger block and copies (rare, so averaged it's O(1)). No extra space beyond the new element.", hint: "Add one item to the end.", expl: "The workhorse for building a list incrementally. Returns None — never write lst = lst.append(x).", ex: "lst = [1, 2]\nlst.append(3)\nprint(lst)" },
      { m: "extend", sig: "lst.extend(iterable)", ret: "None", mut: true, t: "O(k)", s: "O(1)", why: "k = length of the iterable added; each element appended once. In-place, so no extra space beyond the grown list.", hint: "Append every item of another iterable.", expl: "lst.extend([4,5]) adds 4 and 5 separately; lst.append([4,5]) would add the list as ONE element. Common bug source.", ex: "lst = [1, 2]\nlst.extend([3, 4])\nprint(lst)" },
      { m: "insert", sig: "lst.insert(i, x)", ret: "None", mut: true, t: "O(n)", s: "O(1)", why: "Every element from index i onward shifts one slot right — up to n moves. insert(0, x) is the worst case.", hint: "Put x at index i, shifting the rest right.", expl: "Cheap at the end, expensive at the front. If you need front-inserts, a deque gives O(1).", ex: "lst = [1, 3]\nlst.insert(1, 2)\nprint(lst)" },
      { m: "pop", sig: "lst.pop(i=-1)", ret: "the removed element", mut: true, t: "O(1) end / O(n) front", s: "O(1)", why: "Popping the end is one operation. pop(0) or any interior index shifts everything after it left — O(n).", hint: "Remove & return an item (last by default).", expl: "lst.pop() is your stack-pop. lst.pop(0) as a queue is the classic O(n) trap — use deque.popleft().", ex: "lst = [1, 2, 3]\nprint(lst.pop())\nprint(lst.pop(0))" },
      { m: "remove", sig: "lst.remove(x)", ret: "None", mut: true, t: "O(n)", s: "O(1)", why: "Scans left-to-right for the first x (O(n)), then shifts the tail to fill the gap (O(n)). ValueError if absent.", hint: "Delete the first occurrence of value x.", expl: "Removes by VALUE, not index (that's del lst[i] or pop). Raises if x isn't there.", ex: "lst = [1, 2, 3, 2]\nlst.remove(2)\nprint(lst)" },
      { m: "index", sig: "lst.index(x)", ret: "int (position)", mut: false, t: "O(n)", s: "O(1)", why: "Linear scan until x is found. No extra space.", hint: "Find the index of the first x.", expl: "ValueError if absent — guard with 'if x in lst' (also O(n)) or use try/except.", ex: "print(['a', 'b', 'c'].index('b'))" },
      { m: "count", sig: "lst.count(x)", ret: "int", mut: false, t: "O(n)", s: "O(1)", why: "One full pass tallying matches.", hint: "How many times x appears.", expl: "For counting MANY different values, Counter is better — one pass for everything instead of one pass per value.", ex: "print([1, 2, 2, 3, 2].count(2))" },
      { m: "sort", sig: "lst.sort(key=None, reverse=False)", ret: "None", mut: true, t: "O(n log n)", s: "O(n)", why: "Timsort: n log n comparisons. Space is O(n) — Timsort allocates temporary runs (not in-place despite mutating).", hint: "Sort the list in place.", expl: "Returns None (mutates). For a new sorted list leaving the original, use sorted(). Stable: ties keep original order, which is what lets multi-key sorts compose.", ex: "lst = [3, 1, 2]\nlst.sort(reverse=True)\nprint(lst)" },
      { m: "reverse", sig: "lst.reverse()", ret: "None", mut: true, t: "O(n)", s: "O(1)", why: "Swaps elements inward from both ends — n/2 swaps, no extra array.", hint: "Reverse the list in place.", expl: "In-place (O(1) space). lst[::-1] gives a reversed COPY instead (O(n) space).", ex: "lst = [1, 2, 3]\nlst.reverse()\nprint(lst)" },
      { m: "copy", sig: "lst.copy()", ret: "new list (shallow)", mut: false, t: "O(n)", s: "O(n)", why: "Allocates a new list of n references and copies them — O(n) time and space.", hint: "A shallow copy (same as lst[:]).", expl: "Shallow: nested lists are still shared. For independent nested data use copy.deepcopy. Solves the b=a aliasing trap.", ex: "a = [1, 2]\nb = a.copy()\nb.append(3)\nprint(a, b)" },
      { m: "clear", sig: "lst.clear()", ret: "None", mut: true, t: "O(n)", s: "O(1)", why: "Drops references to all n elements; the list object itself is reused.", hint: "Empty the list in place.", expl: "Keeps the same object (other names pointing at it see it emptied) — different from lst = [].", ex: "lst = [1, 2, 3]\nlst.clear()\nprint(lst)" },
    ],
  },
  {
    id: "dict", name: "dict", tag: "key → value · hash map · insertion-ordered (3.7+)",
    methods: [
      { m: "get", sig: "d.get(k, default=None)", ret: "value or default", mut: false, t: "O(1)*", s: "O(1)", why: "One hash + bucket jump (average). Worst case O(n) under adversarial collisions, rare.", hint: "Read a key, with a fallback if missing.", expl: "The no-crash read. d.get(k, 0) is the heart of the counting idiom: d[k] = d.get(k, 0) + 1.", ex: "d = {'a': 1}\nprint(d.get('a'), d.get('z', 0))" },
      { m: "setdefault", sig: "d.setdefault(k, default)", ret: "value at k (existing or just-set)", mut: true, t: "O(1)*", s: "O(1)", why: "One hashed lookup; inserts only if absent. Constant work, constant extra space.", hint: "Get k, inserting default first if it's missing.", expl: "d.setdefault(k, []).append(x) groups items by key in one line — though defaultdict(list) reads cleaner.", ex: "d = {}\nd.setdefault('a', []).append(1)\nprint(d)" },
      { m: "pop", sig: "d.pop(k, default?)", ret: "value removed", mut: true, t: "O(1)*", s: "O(1)", why: "Hashed lookup + remove. Constant.", hint: "Remove key k and return its value.", expl: "KeyError if absent and no default given. With a default, it never raises.", ex: "d = {'a': 1, 'b': 2}\nprint(d.pop('a'))\nprint(d)" },
      { m: "keys", sig: "d.keys()", ret: "view of keys", mut: false, t: "O(1) view / O(n) iterate", s: "O(1)", why: "Returns a live VIEW object instantly (O(1)); walking it is O(n). The view doesn't copy — O(1) space.", hint: "A live view of the keys.", expl: "Reflects later changes to d. 'k in d' already checks keys, so you rarely need .keys() explicitly.", ex: "d = {'a': 1, 'b': 2}\nprint(list(d.keys()))" },
      { m: "values", sig: "d.values()", ret: "view of values", mut: false, t: "O(1) view / O(n) iterate", s: "O(1)", why: "Live view, O(1) to make, O(n) to traverse, no copy.", hint: "A live view of the values.", expl: "sum(d.values()), max(d.values()) — operate on values directly. 'x in d.values()' is O(n) (no index on values).", ex: "d = {'a': 1, 'b': 2}\nprint(sum(d.values()))" },
      { m: "items", sig: "d.items()", ret: "view of (key, value) pairs", mut: false, t: "O(1) view / O(n) iterate", s: "O(1)", why: "Live view of pairs; O(n) to loop, no copy.", hint: "A live view of key–value pairs.", expl: "The idiomatic loop: for k, v in d.items(). Powers dict inversions: {v: k for k, v in d.items()}.", ex: "d = {'a': 1, 'b': 2}\nfor k, v in d.items():\n    print(k, v)" },
      { m: "update", sig: "d.update(other)", ret: "None", mut: true, t: "O(k)", s: "O(1)", why: "k = size of other; each pair inserted/overwritten once. In-place, no new dict.", hint: "Merge another dict in (other wins ties).", expl: "Mutates d. For a NEW merged dict without touching d, use {**d, **other}.", ex: "d = {'a': 1}\nd.update({'b': 2, 'a': 9})\nprint(d)" },
      { m: "Counter", sig: "Counter(iterable)", ret: "Counter (dict subclass)", mut: false, t: "O(n)", s: "O(k)", why: "One pass over n items; space is O(k) for k distinct keys.", hint: "Tally everything in one line.", expl: "from collections import Counter. .most_common(j) returns the top j in O(n log j). Replaces hand-rolled count dicts.", ex: "from collections import Counter\nc = Counter('banana')\nprint(c, c.most_common(1))" },
    ],
  },
  {
    id: "set", name: "set", tag: "unique elements · membership · unordered",
    methods: [
      { m: "add", sig: "s.add(x)", ret: "None", mut: true, t: "O(1)*", s: "O(1)", why: "Hash + bucket insert; duplicate is a no-op. Constant.", hint: "Insert x (ignored if already present).", expl: "The set builder. x must be hashable (no lists/dicts/sets as elements).", ex: "s = {1, 2}\ns.add(2)\ns.add(3)\nprint(sorted(s))" },
      { m: "discard", sig: "s.discard(x)", ret: "None", mut: true, t: "O(1)*", s: "O(1)", why: "Hashed remove; absent is a silent no-op. Constant.", hint: "Remove x — no error if absent.", expl: "Safer sibling of .remove(), which raises KeyError when x isn't there. Prefer discard unless you WANT the error.", ex: "s = {1, 2}\ns.discard(9)\nprint(s)" },
      { m: "remove", sig: "s.remove(x)", ret: "None", mut: true, t: "O(1)*", s: "O(1)", why: "Hashed remove. Constant, but raises KeyError if absent.", hint: "Remove x — errors if absent.", expl: "Use when a missing element is genuinely a bug worth surfacing; otherwise discard.", ex: "s = {1, 2, 3}\ns.remove(2)\nprint(sorted(s))" },
      { m: "union (|)", sig: "a | b  /  a.union(b)", ret: "new set", mut: false, t: "O(len a + len b)", s: "O(len a + len b)", why: "Visits every element of both; the result holds up to all of them — both axes scale with the combined size.", hint: "All elements in either set.", expl: "a |= b updates a in place instead (O(len b) extra).", ex: "print({1, 2} | {2, 3})" },
      { m: "intersection (&)", sig: "a & b", ret: "new set", mut: false, t: "O(min(len a, len b))", s: "O(min)", why: "Python iterates the SMALLER set and probes the larger — so cost scales with the smaller. Result is at most that size.", hint: "Elements in both sets.", expl: "The 'common to both lists' idiom: set(a) & set(b).", ex: "print({1, 2, 3} & {2, 3, 4})" },
      { m: "difference (-)", sig: "a - b", ret: "new set", mut: false, t: "O(len a)", s: "O(len a)", why: "Walks a, keeping elements not in b (each membership test O(1)). Result up to len a.", hint: "In a but not in b.", expl: "Order matters: a - b ≠ b - a. Symmetric difference is a ^ b.", ex: "print({1, 2, 3} - {2})" },
    ],
  },
  {
    id: "str", name: "str", tag: "immutable character sequence — every method returns NEW",
    methods: [
      { m: "split", sig: "s.split(sep=None)", ret: "list of str", mut: false, t: "O(n)", s: "O(n)", why: "One pass over n chars; the result list holds all the pieces — O(n) space.", hint: "Break a string into a list.", expl: "No arg splits on any run of whitespace (and drops empties). s.split(',') keeps empty strings between consecutive commas.", ex: "print('a, b,  c'.split())\nprint('a,b,,c'.split(','))" },
      { m: "join", sig: "sep.join(iterable)", ret: "str", mut: false, t: "O(n)", s: "O(n)", why: "Single pass concatenating into one new string of total length n. THE fix for the O(n²) += loop.", hint: "Glue an iterable of strings together.", expl: "Called on the SEPARATOR: '-'.join(parts). Build a list of parts in a loop, then join once.", ex: "print('-'.join(['a', 'b', 'c']))" },
      { m: "strip", sig: "s.strip(chars=None)", ret: "str (new)", mut: false, t: "O(n)", s: "O(n)", why: "Scans from both ends; builds a new trimmed string (strings are immutable).", hint: "Trim whitespace (or given chars) off both ends.", expl: "lstrip/rstrip do one side. Returns a NEW string — the original is unchanged.", ex: "print('  hi  '.strip() + '|')" },
      { m: "replace", sig: "s.replace(old, new)", ret: "str (new)", mut: false, t: "O(n)", s: "O(n)", why: "One pass finding occurrences; allocates a new string with substitutions.", hint: "Swap all occurrences of a substring.", expl: "Returns a new string. Optional count arg limits replacements: s.replace('a','x',1).", ex: "print('banana'.replace('a', 'o'))" },
      { m: "find / index", sig: "s.find(sub)  /  s.index(sub)", ret: "int position (or -1 / error)", mut: false, t: "O(n·m)", s: "O(1)", why: "Substring search: for each of n start positions, compare up to m chars — O(n·m) worst case.", hint: "Locate a substring.", expl: "find returns -1 if absent; index raises ValueError. Use find when 'not present' is normal.", ex: "print('hello'.find('ll'), 'hello'.find('z'))" },
      { m: "lower / upper", sig: "s.lower()  /  s.upper()", ret: "str (new)", mut: false, t: "O(n)", s: "O(n)", why: "Builds a new string char by char.", hint: "Change case.", expl: "Case-insensitive compares: a.lower() == b.lower(). Both return new strings.", ex: "print('Hello'.lower(), 'Hello'.upper())" },
      { m: "startswith / endswith", sig: "s.startswith(prefix)", ret: "bool", mut: false, t: "O(m)", s: "O(1)", why: "Compares up to m = len(prefix) characters; stops early on mismatch.", hint: "Prefix/suffix test.", expl: "Cleaner and faster than slicing-and-comparing. Accepts a tuple of options: s.startswith(('a','b')).", ex: "print('python'.startswith('py'), 'file.txt'.endswith('.txt'))" },
      { m: "count", sig: "s.count(sub)", ret: "int", mut: false, t: "O(n·m)", s: "O(1)", why: "Scans for non-overlapping occurrences across the string.", hint: "Count substring occurrences.", expl: "Counts non-overlapping matches: 'aaa'.count('aa') is 1, not 2.", ex: "print('banana'.count('a'))" },
      { m: "isdigit / isalpha", sig: "s.isdigit()  /  s.isalpha()", ret: "bool", mut: false, t: "O(n)", s: "O(1)", why: "Checks every character once.", hint: "Whole-string character-class test.", expl: "True only if ALL chars qualify and the string is non-empty. Useful for input validation/parsing.", ex: "print('123'.isdigit(), 'a1'.isalpha())" },
    ],
  },
  {
    id: "deque", name: "deque", tag: "double-ended queue — O(1) at both ends",
    methods: [
      { m: "append", sig: "dq.append(x)", ret: "None", mut: true, t: "O(1)", s: "O(1)", why: "Block-linked structure adds at the right end in true constant time (no resize-copy like list's amortization).", hint: "Add to the right end.", expl: "from collections import deque. Same end as a list's append.", ex: "from collections import deque\ndq = deque([1, 2])\ndq.append(3)\nprint(list(dq))" },
      { m: "appendleft", sig: "dq.appendleft(x)", ret: "None", mut: true, t: "O(1)", s: "O(1)", why: "Adds at the LEFT end in constant time — the thing a list cannot do cheaply (list.insert(0,x) is O(n)).", hint: "Add to the left end.", expl: "This is half of why deque exists. Front operations are free.", ex: "from collections import deque\ndq = deque([2, 3])\ndq.appendleft(1)\nprint(list(dq))" },
      { m: "popleft", sig: "dq.popleft()", ret: "leftmost element", mut: true, t: "O(1)", s: "O(1)", why: "Removes from the left in constant time. This is the BFS workhorse — list.pop(0) would be O(n).", hint: "Remove & return from the left.", expl: "The reason BFS uses deque. Pairs with append for a FIFO queue.", ex: "from collections import deque\nq = deque([1, 2, 3])\nprint(q.popleft())\nprint(list(q))" },
      { m: "pop", sig: "dq.pop()", ret: "rightmost element", mut: true, t: "O(1)", s: "O(1)", why: "Constant-time right removal.", hint: "Remove & return from the right.", expl: "Takes no index argument (unlike list.pop(i)). append + pop = a stack; append + popleft = a queue.", ex: "from collections import deque\ndq = deque([1, 2, 3])\nprint(dq.pop())" },
      { m: "deque(maxlen=k)", sig: "deque(iterable, maxlen=k)", ret: "bounded deque", mut: true, t: "O(1)/op", s: "O(k)", why: "Fixed capacity k; adding past it auto-drops the opposite end in O(1). Space capped at k.", hint: "A self-trimming fixed-size window/buffer.", expl: "Perfect for 'last k items' or a sliding fixed window — pushes silently evict the far end.", ex: "from collections import deque\ndq = deque(maxlen=3)\nfor x in [1, 2, 3, 4]:\n    dq.append(x)\nprint(list(dq))" },
    ],
  },
  {
    id: "heapq", name: "heapq", tag: "min-heap functions over a plain list",
    methods: [
      { m: "heappush", sig: "heapq.heappush(h, x)", ret: "None", mut: true, t: "O(log n)", s: "O(1)", why: "Adds at the end, then bubbles up along one root-to-leaf path of a height-log-n tree. No extra space.", hint: "Add x, keeping heap order.", expl: "import heapq; h starts as []. Push tuples (priority, item) to order by priority. Tie-break with (priority, counter, item) to avoid comparing items.", ex: "import heapq\nh = []\nfor x in [5, 1, 3]:\n    heapq.heappush(h, x)\nprint(h[0])" },
      { m: "heappop", sig: "heapq.heappop(h)", ret: "smallest element", mut: true, t: "O(log n)", s: "O(1)", why: "Removes index 0, moves the last element to the top, sifts it down one path — log n.", hint: "Remove & return the minimum.", expl: "Always the min (top). For a max-heap, push negatives and negate on the way out.", ex: "import heapq\nh = [3, 1, 2]\nheapq.heapify(h)\nprint(heapq.heappop(h))" },
      { m: "heapify", sig: "heapq.heapify(lst)", ret: "None", mut: true, t: "O(n)", s: "O(1)", why: "Cleverly O(n), NOT O(n log n): most nodes are near the bottom and sift down very little. In-place.", hint: "Turn a list into a heap in place.", expl: "Faster than n pushes. Use when you already have all the data up front.", ex: "import heapq\nh = [5, 1, 3, 2]\nheapq.heapify(h)\nprint(h[0])" },
      { m: "h[0]", sig: "h[0]", ret: "minimum (peek)", mut: false, t: "O(1)", s: "O(1)", why: "The min is always at index 0 by the heap invariant — direct read.", hint: "Peek the smallest without removing.", expl: "Peeking is free; only push/pop cost log n.", ex: "import heapq\nh = [4, 9, 2]\nheapq.heapify(h)\nprint(h[0])" },
      { m: "nlargest / nsmallest", sig: "heapq.nlargest(k, it)", ret: "list of k items", mut: false, t: "O(n log k)", s: "O(k)", why: "Maintains a size-k heap across n items: n pushes/pops each O(log k); space is the k-heap.", hint: "Top-k without sorting everything.", expl: "Beats sorted(...)[:k] (O(n log n)) when k ≪ n. Accepts key= like sorted.", ex: "import heapq\nprint(heapq.nlargest(2, [5, 1, 9, 3]))" },
    ],
  },
];

/* flat list for drills */
const ALL = STRUCTS.flatMap(s => s.methods.map(m => ({ ...m, struct: s.name, structId: s.id })));

/* ============ MUTATES-OR-RETURNS DRILL ============ */
const MUT_Q = ALL.filter(m =>
  ["append", "sort", "reverse", "extend", "insert", "add", "discard", "update", "popleft", "heappush", "heapify", "clear", "remove"].includes(m.m) ||
  ["split", "join", "strip", "replace", "lower / upper", "copy", "get", "items"].includes(m.m)
).map(m => ({ q: m.sig, struct: m.struct, mut: m.mut, ret: m.ret, why: m.mut ? `Mutates in place, returns ${m.ret}.` : `Does NOT mutate — returns ${m.ret}.` }));

/* ============ METHOD MATCH ============ */
const MATCH = [
  { goal: "Remove and return the LAST item of a list", a: "lst.pop()", opts: ["lst.pop()", "lst.remove(-1)", "lst.pop(0)", "del lst[-1]"], why: "pop() defaults to the last index and returns it. remove() takes a value; del doesn't return." },
  { goal: "Add x to the FRONT of a queue in O(1)", a: "dq.appendleft(x)", opts: ["lst.insert(0, x)", "dq.appendleft(x)", "lst.append(x)", "dq.append(x)"], why: "Only deque.appendleft is O(1) at the front. list.insert(0,x) works but is O(n)." },
  { goal: "Count how many times each character appears", a: "Counter(s)", opts: ["s.count()", "Counter(s)", "len(set(s))", "s.split()"], why: "Counter tallies all distinct keys in one pass; s.count(x) only counts one value at a time." },
  { goal: "Read a dict key with 0 if it's missing", a: "d.get(k, 0)", opts: ["d[k]", "d.get(k, 0)", "d.setdefault(k)", "d.pop(k, 0)"], why: "get returns the default without inserting or raising. d[k] raises KeyError; pop would remove it." },
  { goal: "Glue a list of strings with commas, fast", a: "','.join(parts)", opts: ["sum(parts)", "','.join(parts)", "parts + ','", "for += loop"], why: "join is O(n); building with += in a loop is O(n²)." },
  { goal: "Get the 3 largest numbers without full sort", a: "heapq.nlargest(3, xs)", opts: ["sorted(xs)[:3]", "heapq.nlargest(3, xs)", "max(xs)", "xs.sort()[:3]"], why: "nlargest is O(n log k); full sort is O(n log n) (and xs.sort() returns None — that line crashes)." },
  { goal: "Remove a set element, no error if absent", a: "s.discard(x)", opts: ["s.remove(x)", "s.discard(x)", "s.pop(x)", "del s[x]"], why: "discard is the silent version; remove raises KeyError when absent." },
  { goal: "Merge dict b into a, b winning conflicts", a: "a.update(b)", opts: ["a + b", "a.update(b)", "a.merge(b)", "a.extend(b)"], why: "update merges in place, incoming values win. (a+b isn't defined for dicts; extend is a list method.)" },
  { goal: "Reverse a list WITHOUT making a copy", a: "lst.reverse()", opts: ["lst[::-1]", "lst.reverse()", "reversed(lst)", "sorted(lst)"], why: "reverse() is in-place O(1) space; lst[::-1] builds a new O(n) copy." },
  { goal: "Build a list grouped by key in one line", a: "d.setdefault(k, []).append(x)", opts: ["d[k].append(x)", "d.setdefault(k, []).append(x)", "d.get(k).append(x)", "d.update(k, x)"], why: "setdefault creates the empty list on first sight of k; d[k] would KeyError, d.get(k) returns None." },
  { goal: "Turn an existing list into a heap cheaply", a: "heapq.heapify(lst)", opts: ["heapq.heappush each", "heapq.heapify(lst)", "lst.sort()", "sorted(lst)"], why: "heapify is O(n) in place — cheaper than n pushes (O(n log n)) and you don't need full sorting." },
  { goal: "Test if a string is all digits", a: "s.isdigit()", opts: ["int(s)", "s.isdigit()", "type(s)==int", "s.count(digits)"], why: "isdigit() returns a bool safely; int(s) raises on non-digits." },
];

/* ============ STORAGE ============ */
const KEY = "method-dex-v1";
const EMPTY = { mastered: [], mut: { right: 0, total: 0 }, match: { right: 0, total: 0 }, seen: [] };
async function load() { try { const r = await window.storage.get(KEY); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function save(p) { try { await window.storage.set(KEY, JSON.stringify(p)); } catch { } }

/* ============ ATOMS ============ */
function CostTag({ label, value }) {
  const danger = /n²|n\^2/.test(value) || (/O\(n\)/.test(value) && label === "time");
  const good = /O\(1\)/.test(value);
  const col = good ? C.green : danger ? C.amber : C.cyan;
  return (
    <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs mr-1.5 mb-1.5" style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${C.line}` }}>
      <span style={{ color: C.dim }}>{label}</span><span style={{ color: col }}>{value}</span>
    </span>
  );
}
function MutBadge({ mut }) {
  return <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ fontFamily: MONO, background: mut ? C.amberSoft : C.cyanSoft, color: mut ? C.amber : C.cyan }}>{mut ? "mutates" : "returns new"}</span>;
}
function Btn({ onClick, primary, danger, disabled, children, small }) {
  return <button onClick={onClick} disabled={disabled} className={`rounded font-semibold ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-xs"}`}
    style={{ background: disabled ? C.panel2 : primary ? C.violet : C.panel2, color: disabled ? "#4A5266" : primary ? "#0B0E14" : danger ? C.red : C.text, border: `1px solid ${disabled ? C.line : primary ? C.violet : C.line}`, fontFamily: MONO }}>{children}</button>;
}
function Note({ color, label, children }) {
  return <div className="rounded p-3 text-sm leading-relaxed" style={{ background: C.deep, border: `1px solid ${C.line}`, borderLeft: `3px solid ${color}`, color: C.text }}><span style={{ color, fontFamily: MONO, fontSize: "0.7rem" }}>{label} ▸ </span>{children}</div>;
}

/* ============ DEX (catalog) ============ */
function MethodCard({ m, pyStatus, mastered, onMaster }) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState(null);
  const run = async () => { const r = await runPy(m.ex); setRes(r); };
  return (
    <div className="rounded-lg" style={{ background: C.panel, border: `1px solid ${mastered ? C.green : open ? C.violet : C.line}` }}>
      <button onClick={() => setOpen(!open)} className="w-full text-left p-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ fontFamily: MONO, color: open ? C.violet : C.text }}>{m.sig}</span>
          <MutBadge mut={m.mut} />
          {mastered && <span className="text-xs" style={{ color: C.green, fontFamily: MONO }}>✓</span>}
          <span className="ml-auto" style={{ color: C.dim }}>{open ? "−" : "+"}</span>
        </div>
        <div className="text-xs mt-1.5" style={{ color: C.dim }}>{m.hint}</div>
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-3">
          <div>
            <CostTag label="time" value={m.t} />
            <CostTag label="space" value={m.s} />
            <span className="inline-flex items-center rounded px-2 py-1 text-xs mb-1.5" style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${C.line}` }}><span style={{ color: C.dim }}>returns&nbsp;</span><span style={{ color: C.text }}>{m.ret}</span></span>
          </div>
          <Note color={C.cyan} label="WHY THAT COST">{m.why}</Note>
          <Note color={C.violet} label="WHEN / WHY">{m.expl}</Note>
          <pre className="rounded p-3 text-xs overflow-x-auto" style={{ fontFamily: MONO, background: "#080B11", border: `1px solid ${C.line}`, color: C.cyan, lineHeight: 1.7 }}>{m.ex}</pre>
          <div className="flex flex-wrap gap-2">
            {pyStatus === "ready" && <Btn small onClick={run}>▶ run example</Btn>}
            <Btn small primary={!mastered} onClick={() => onMaster(m.sig)}>{mastered ? "✓ mastered (toggle)" : "mark mastered"}</Btn>
          </div>
          {res && <pre className="rounded p-3 text-xs" style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${res.err ? C.red : C.green}`, color: res.err ? C.red : C.text, whiteSpace: "pre-wrap" }}>{res.err || res.out || "(no output)"}</pre>}
        </div>
      )}
    </div>
  );
}

function Dex({ pyStatus, progress, onMaster }) {
  const [sid, setSid] = useState("list");
  const [q, setQ] = useState("");
  const struct = STRUCTS.find(s => s.id === sid);
  const filtered = q.trim()
    ? ALL.filter(m => (m.sig + m.hint + m.m).toLowerCase().includes(q.toLowerCase()))
    : struct.methods.map(m => ({ ...m, structId: sid }));
  return (
    <div className="flex flex-col gap-3">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="search all methods…  (e.g. 'remove', 'O(n²)', 'queue')"
        className="w-full rounded px-3 py-2.5 text-sm" style={{ fontFamily: MONO, background: C.panel, border: `1px solid ${C.line}`, color: C.text, outline: "none" }} />
      {!q.trim() && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STRUCTS.map(s => (
            <button key={s.id} onClick={() => setSid(s.id)} className="px-3 py-2 rounded text-xs shrink-0"
              style={{ fontFamily: MONO, background: s.id === sid ? C.violetSoft : C.panel, border: `1px solid ${s.id === sid ? C.violet : C.line}`, color: s.id === sid ? C.violet : C.dim }}>{s.name}</button>
          ))}
        </div>
      )}
      {!q.trim() && <div className="text-xs px-1" style={{ color: C.dim }}>{struct.tag}</div>}
      {filtered.map((m, i) => <MethodCard key={i} m={m} pyStatus={pyStatus} mastered={progress.mastered.includes(m.sig)} onMaster={onMaster} />)}
      {q.trim() && filtered.length === 0 && <div className="text-sm text-center py-6" style={{ color: C.dim }}>no methods match “{q}”.</div>}
    </div>
  );
}

/* ============ FLASHCARDS (spaced repetition) ============ */
function Flashcards({ progress, onMaster, onSeen }) {
  const queue = useRef(null);
  if (queue.current === null) {
    const known = new Set(progress.mastered);
    const unknown = ALL.filter(m => !known.has(m.sig));
    const pool = unknown.length ? unknown : ALL;
    queue.current = [...pool].sort(() => Math.random() - 0.5);
  }
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = queue.current[pos % queue.current.length];

  const grade = (knew) => {
    onSeen(card.sig);
    if (knew) onMaster(card.sig, true);
    else {
      // resurface soon: reinsert a few cards ahead
      const q = queue.current;
      const insertAt = Math.min(q.length, pos + 3);
      q.splice(insertAt, 0, card);
    }
    setFlipped(false);
    setPos(p => p + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      <Note color={C.violet} label="RECALL">
        See the method, recall its return value, whether it mutates, and its cost — THEN flip. "Got it" retires the card; "missed" resurfaces it a few cards later. Spaced repetition.
      </Note>
      <div className="rounded-lg p-5 min-h-52 flex flex-col" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="text-xs mb-3" style={{ fontFamily: MONO, color: C.dim }}>{card.struct}</div>
        <div className="text-lg font-bold mb-1" style={{ fontFamily: MONO, color: C.text }}>{card.sig}</div>
        <div className="text-sm mb-4" style={{ color: C.dim }}>{card.hint}</div>

        {!flipped ? (
          <div className="mt-auto flex flex-col items-center gap-3 py-4">
            <div className="text-sm" style={{ color: C.dim }}>Recall: returns? · mutates? · time/space?</div>
            <Btn primary onClick={() => setFlipped(true)}>flip ↻</Btn>
          </div>
        ) : (
          <div className="mt-auto flex flex-col gap-3">
            <div className="rounded p-3" style={{ background: C.deep, border: `1px solid ${C.line}` }}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <MutBadge mut={card.mut} />
                <span className="text-xs" style={{ fontFamily: MONO, color: C.text }}>returns: {card.ret}</span>
              </div>
              <CostTag label="time" value={card.t} />
              <CostTag label="space" value={card.s} />
              <div className="text-xs mt-2 leading-relaxed" style={{ color: C.dim }}>{card.why}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => grade(false)} className="flex-1 rounded px-4 py-2.5 text-xs font-semibold" style={{ background: C.redSoft, color: C.red, border: `1px solid ${C.red}`, fontFamily: MONO }}>missed — resurface</button>
              <button onClick={() => grade(true)} className="flex-1 rounded px-4 py-2.5 text-xs font-semibold" style={{ background: C.greenSoft, color: C.green, border: `1px solid ${C.green}`, fontFamily: MONO }}>got it ✓</button>
            </div>
          </div>
        )}
      </div>
      <div className="text-center text-xs" style={{ fontFamily: MONO, color: C.dim }}>
        mastered {progress.mastered.length} / {ALL.length} methods
      </div>
    </div>
  );
}

/* ============ MUT DRILL ============ */
function MutDrill({ progress, onScore }) {
  const [order] = useState(() => [...MUT_Q.keys()].sort(() => Math.random() - 0.5));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState(null);
  const item = MUT_Q[order[pos % order.length]];
  const choose = (val) => { if (picked !== null) return; setPicked(val); onScore(val === item.mut); };
  return (
    <div className="rounded-lg p-4 sm:p-5 flex flex-col gap-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-baseline justify-between">
        <div className="text-base font-bold">Mutates or returns?</div>
        <span className="text-xs" style={{ fontFamily: MONO, color: C.dim }}>{progress.mut.right}/{progress.mut.total}</span>
      </div>
      <div className="text-xs" style={{ color: C.dim }}>The #1 beginner trap: does this change the object in place, or hand back a new value?</div>
      <pre className="rounded p-4 text-sm" style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${C.line}`, color: C.text }}>{item.q}<span style={{ color: C.dim }}>   # ({item.struct})</span></pre>
      <div className="grid grid-cols-2 gap-2">
        {[{ v: true, l: "mutates in place" }, { v: false, l: "returns a new value" }].map(o => {
          let bg = C.panel2, bd = C.line, fg = C.text;
          if (picked !== null) { if (o.v === item.mut) { bg = C.greenSoft; bd = C.green; fg = C.green; } else if (o.v === picked) { bg = C.redSoft; bd = C.red; fg = C.red; } else fg = C.dim; }
          return <button key={String(o.v)} onClick={() => choose(o.v)} className="rounded px-3 py-3 text-sm" style={{ fontFamily: MONO, background: bg, border: `1px solid ${bd}`, color: fg }}>{o.l}</button>;
        })}
      </div>
      {picked !== null && <Note color={picked === item.mut ? C.green : C.red} label={picked === item.mut ? "RIGHT" : "ACTUALLY"}>{item.why}</Note>}
      {picked !== null && <Btn primary onClick={() => { setPicked(null); setPos(p => p + 1); }}>next →</Btn>}
    </div>
  );
}

/* ============ METHOD MATCH ============ */
function MethodMatch({ progress, onScore }) {
  const [order] = useState(() => [...MATCH.keys()].sort(() => Math.random() - 0.5));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState(null);
  const item = MATCH[order[pos % order.length]];
  const [opts] = useStableShuffle(item, pos);
  const choose = (o) => { if (picked !== null) return; setPicked(o); onScore(o === item.a); };
  return (
    <div className="rounded-lg p-4 sm:p-5 flex flex-col gap-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-baseline justify-between">
        <div className="text-base font-bold">Method match</div>
        <span className="text-xs" style={{ fontFamily: MONO, color: C.dim }}>{progress.match.right}/{progress.match.total}</span>
      </div>
      <div className="rounded p-4 text-sm" style={{ background: C.deep, border: `1px solid ${C.line}`, color: C.text }}>{item.goal}</div>
      <div className="flex flex-col gap-2">
        {opts.map(o => {
          let bg = C.panel2, bd = C.line, fg = C.text;
          if (picked !== null) { if (o === item.a) { bg = C.greenSoft; bd = C.green; fg = C.green; } else if (o === picked) { bg = C.redSoft; bd = C.red; fg = C.red; } else fg = C.dim; }
          return <button key={o} onClick={() => choose(o)} className="text-left rounded px-3 py-2.5 text-sm" style={{ fontFamily: MONO, background: bg, border: `1px solid ${bd}`, color: fg }}>{o}</button>;
        })}
      </div>
      {picked !== null && <Note color={picked === item.a ? C.green : C.red} label={picked === item.a ? "RIGHT" : "THE WHY"}>{item.why}</Note>}
      {picked !== null && <Btn primary onClick={() => { setPicked(null); setPos(p => p + 1); }}>next →</Btn>}
    </div>
  );
}
function useStableShuffle(item, pos) {
  return useMemo(() => [[...item.opts].sort(() => Math.random() - 0.5)], [pos]); // eslint-disable-line
}

/* ============ PROGRESS ============ */
function ProgressPage({ progress, onReset }) {
  const pct = (r, t) => (t ? Math.round((100 * r) / t) + "%" : "—");
  const perStruct = STRUCTS.map(s => {
    const total = s.methods.length;
    const done = s.methods.filter(m => progress.mastered.includes(m.sig)).length;
    return { name: s.name, done, total };
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg p-4 sm:p-5 flex flex-col gap-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="text-base font-bold">Mastery by structure</div>
        {perStruct.map((p, i) => (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1" style={{ fontFamily: MONO }}>
              <span style={{ color: C.text }}>{p.name}</span>
              <span style={{ color: p.done === p.total ? C.green : C.dim }}>{p.done}/{p.total}</span>
            </div>
            <div className="h-1.5 rounded" style={{ background: C.line }}>
              <div className="h-1.5 rounded" style={{ width: `${(100 * p.done) / p.total}%`, background: p.done === p.total ? C.green : C.violet, transition: "width 300ms" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg p-4 sm:p-5 flex flex-col gap-2" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        <div className="text-base font-bold mb-1">Drill accuracy</div>
        <div className="flex justify-between text-sm rounded px-4 py-3" style={{ background: C.deep, border: `1px solid ${C.line}` }}><span>Mutates-or-returns</span><span style={{ fontFamily: MONO, color: C.cyan }}>{progress.mut.right}/{progress.mut.total} ({pct(progress.mut.right, progress.mut.total)})</span></div>
        <div className="flex justify-between text-sm rounded px-4 py-3" style={{ background: C.deep, border: `1px solid ${C.line}` }}><span>Method match</span><span style={{ fontFamily: MONO, color: C.cyan }}>{progress.match.right}/{progress.match.total} ({pct(progress.match.right, progress.match.total)})</span></div>
      </div>
      <Note color={C.amber} label="WHERE THIS FITS">
        This is the memorization layer — method surface, return values, and cost intuition. It removes friction, but knowing methods cold is necessary, not sufficient. Spend the bulk of your hours on blank-page solving; use this between sessions to kill the small hesitations.
      </Note>
      <div><Btn danger onClick={onReset}>reset all progress</Btn></div>
    </div>
  );
}

/* ============ APP ============ */
export default function App() {
  const [tab, setTab] = useState("dex");
  const [pyStatus, setPyStatus] = useState("loading");
  const [progress, setProgress] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { bootPy(setPyStatus); }, []);
  useEffect(() => { (async () => { const p = await load(); if (p) setProgress({ ...EMPTY, ...p }); setLoaded(true); })(); }, []);
  useEffect(() => { if (loaded) save(progress); }, [progress, loaded]);

  const onMaster = useCallback((sig, force) => {
    setProgress(p => {
      const has = p.mastered.includes(sig);
      if (force) return has ? p : { ...p, mastered: [...p.mastered, sig] };
      return has ? { ...p, mastered: p.mastered.filter(x => x !== sig) } : { ...p, mastered: [...p.mastered, sig] };
    });
  }, []);
  const onSeen = useCallback((sig) => setProgress(p => p.seen.includes(sig) ? p : { ...p, seen: [...p.seen, sig] }), []);
  const onMut = (ok) => setProgress(p => ({ ...p, mut: { right: p.mut.right + (ok ? 1 : 0), total: p.mut.total + 1 } }));
  const onMatch = (ok) => setProgress(p => ({ ...p, match: { right: p.match.right + (ok ? 1 : 0), total: p.match.total + 1 } }));

  const tabs = [
    { id: "dex", label: "Method Dex" },
    { id: "cards", label: "Flashcards" },
    { id: "mut", label: "Mutate?" },
    { id: "match", label: "Match" },
    { id: "progress", label: "Progress" },
  ];

  return (
    <div className="min-h-screen" style={{ background: C.bg, fontFamily: SANS, color: C.text }}>
      <div className="px-4 sm:px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-xs mb-1" style={{ fontFamily: MONO, color: C.violet, letterSpacing: "0.18em" }}>METHOD DEX</div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Every method, cold — signature, return, mutation, and both costs.</h1>
          <div className="text-xs mt-1.5" style={{ color: C.dim }}>The full built-in method surface, drilled until the names stop making you pause.</div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-3 sticky top-0 z-10" style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
        <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="px-4 py-2 rounded-full text-xs font-semibold shrink-0"
              style={{ fontFamily: MONO, letterSpacing: "0.05em", background: tab === t.id ? C.violet : "transparent", color: tab === t.id ? "#0B0E14" : C.dim, border: `1px solid ${tab === t.id ? C.violet : C.line}` }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {pyStatus === "loading" && tab === "dex" && <Note color={C.amber} label="OPTIONAL">CPython is loading so you can run examples live (~5–10s). The catalog, costs, and all drills work without it.</Note>}
          {tab === "dex" && <Dex pyStatus={pyStatus} progress={progress} onMaster={onMaster} />}
          {tab === "cards" && <Flashcards progress={progress} onMaster={onMaster} onSeen={onSeen} />}
          {tab === "mut" && <MutDrill progress={progress} onScore={onMut} />}
          {tab === "match" && <MethodMatch progress={progress} onScore={onMatch} />}
          {tab === "progress" && <ProgressPage progress={progress} onReset={() => setProgress(EMPTY)} />}
          <div className="text-center text-xs py-4" style={{ color: "#3A4254", fontFamily: MONO }}>
            mutates vs returns · cost on both axes · the why beneath each
          </div>
        </div>
      </div>
    </div>
  );
}
