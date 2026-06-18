import { useState, useEffect, useRef, useCallback } from "react";

/* ============ THEME (sibling of Trace Terminal — cyan-led) ============ */
const C = {
  bg: "#0B0E14", panel: "#11161F", panel2: "#161D29", deep: "#0D1119",
  line: "#232B3B", text: "#E8E4D8", dim: "#8B93A7",
  cyan: "#4FC1B6", cyanSoft: "rgba(79,193,182,0.14)",
  amber: "#E8A33D", amberSoft: "rgba(232,163,61,0.14)",
  red: "#E0564B", redSoft: "rgba(224,86,75,0.15)",
  green: "#69C181", greenSoft: "rgba(105,193,129,0.14)",
};
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/* ============ PYODIDE ============ */
const PYODIDE_VER = "0.23.4";
const PYODIDE_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pyodide/${PYODIDE_VER}/`;
const HARNESS = `
import sys, io, json, traceback
def _bench_run(user_code, setup_code, check_code):
    buf = io.StringIO()
    old = sys.stdout
    ns = {}
    err = None
    chk = None
    try:
        compile(user_code, "<your code>", "exec")
    except SyntaxError as e:
        return json.dumps({"ok": False, "out": "", "err": "SyntaxError: " + str(e.msg) + " (line " + str(e.lineno) + ")", "check": None})
    sys.stdout = buf
    try:
        if setup_code:
            exec(setup_code, ns)
        exec(user_code, ns)
        if check_code:
            chk = bool(eval(check_code, ns))
    except Exception:
        lines = traceback.format_exc().strip().split("\\n")
        err = lines[-1]
    finally:
        sys.stdout = old
    return json.dumps({"ok": err is None, "out": buf.getvalue(), "err": err, "check": chk})
`;

let pyodideInstance = null;
async function bootPyodide(onStatus) {
  try {
    onStatus("loading");
    if (!window.loadPyodide) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = PYODIDE_BASE + "pyodide.js";
        s.onload = resolve;
        s.onerror = () => reject(new Error("script load failed"));
        document.head.appendChild(s);
      });
    }
    pyodideInstance = await window.loadPyodide({ indexURL: PYODIDE_BASE });
    pyodideInstance.runPython(HARNESS);
    onStatus("ready");
  } catch (e) {
    pyodideInstance = null;
    onStatus("failed");
  }
}

async function runPython(code, setup = "", check = "") {
  if (!pyodideInstance) return { ok: false, out: "", err: "interpreter not loaded", check: null };
  try {
    pyodideInstance.globals.set("user_code", code);
    pyodideInstance.globals.set("setup_code", setup);
    pyodideInstance.globals.set("check_code", check);
    const raw = pyodideInstance.runPython("_bench_run(user_code, setup_code, check_code)");
    return JSON.parse(raw);
  } catch (e) {
    return { ok: false, out: "", err: String(e).split("\n")[0], check: null };
  }
}

/* Heuristic fallback — honest degraded mode */
function heuristicCheck(code) {
  const open = { "(": ")", "[": "]", "{": "}" };
  const close = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  const lines = code.split("\n");
  for (let li = 0; li < lines.length; li++) {
    let inStr = null;
    const line = lines[li];
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inStr) { if (ch === inStr && line[i - 1] !== "\\") inStr = null; continue; }
      if (ch === "'" || ch === '"') { inStr = ch; continue; }
      if (ch === "#") break;
      if (open[ch]) stack.push({ ch, li });
      else if (close[ch]) {
        const top = stack.pop();
        if (!top || top.ch !== close[ch]) return `Bracket mismatch: unexpected '${ch}' (line ${li + 1})`;
      }
    }
    if (inStr) return `Unterminated string (line ${li + 1})`;
    const stripped = line.replace(/#.*$/, "").trimEnd();
    if (/^\s*(def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(stripped) && stripped && !stripped.endsWith(":") && !stripped.endsWith("\\")) {
      return `Missing ':' at end of statement (line ${li + 1})`;
    }
  }
  if (stack.length) return `Unclosed '${stack[stack.length - 1].ch}' (line ${stack[stack.length - 1].li + 1})`;
  return null;
}

/* ============ REFERENCE CARDS ============ */
const G = "g", A = "a", R = "r";
const CARDS = [
  {
    id: "list", name: "list", mnemonic: "A row of numbered lockers — jump to any locker instantly; squeezing one into the middle shoves everything down.",
    ops: [
      { op: "lst[i]", cost: "O(1)", c: G, note: "index = pure arithmetic", ex: "lst = [10, 20, 30]\nprint(lst[1])\nprint(lst[-1])  # last" },
      { op: "lst.append(x)", cost: "O(1)*", c: G, note: "amortized — occasional resize", ex: "lst = [1, 2]\nlst.append(3)\nprint(lst)" },
      { op: "lst.pop()", cost: "O(1)", c: G, note: "from the END", ex: "lst = [1, 2, 3]\nprint(lst.pop())\nprint(lst)" },
      { op: "lst.pop(0)", cost: "O(n)", c: R, note: "TRAP — shifts everything; use deque", ex: "from collections import deque\ndq = deque([1, 2, 3])\nprint(dq.popleft())  # O(1)" },
      { op: "x in lst", cost: "O(n)", c: R, note: "TRAP in loops — use a set", ex: "lst = [1, 2, 3]\nprint(2 in lst)   # scans\nprint(2 in set(lst))  # O(1)" },
      { op: "lst[a:b]", cost: "O(k)", c: A, note: "slices COPY", ex: "lst = [1, 2, 3, 4, 5]\nprint(lst[1:4])\nprint(lst[::-1])  # reversed copy" },
      { op: "lst.sort()", cost: "O(n log n)", c: A, note: "in place, returns None!", ex: "lst = [3, 1, 2]\nlst.sort()\nprint(lst)\nprint(sorted([3,1,2], reverse=True))" },
      { op: "lst.insert(0, x)", cost: "O(n)", c: R, note: "front insert shifts all", ex: "lst = [2, 3]\nlst.insert(0, 1)  # works, but O(n)\nprint(lst)" },
      { op: "len(lst)", cost: "O(1)", c: G, note: "stored, not counted", ex: "print(len([1, 2, 3]))" },
    ],
  },
  {
    id: "dict", name: "dict", mnemonic: "Phone contacts — type the name, jump straight to the number. No scrolling.",
    ops: [
      { op: "d[k] / d[k]=v", cost: "O(1)*", c: G, note: "hash → bucket → jump", ex: "d = {'a': 1}\nd['b'] = 2\nprint(d['a'], d)" },
      { op: "k in d", cost: "O(1)*", c: G, note: "membership on KEYS", ex: "d = {'a': 1}\nprint('a' in d)\nprint(1 in d)  # False — values aren't keys" },
      { op: "d.get(k, default)", cost: "O(1)*", c: G, note: "no KeyError on miss", ex: "d = {'a': 1}\nprint(d.get('z', 0))\nd['z'] = d.get('z', 0) + 1  # counting idiom\nprint(d)" },
      { op: "del d[k]", cost: "O(1)*", c: G, note: "KeyError if absent", ex: "d = {'a': 1, 'b': 2}\ndel d['a']\nprint(d)" },
      { op: "d.items()/keys()/values()", cost: "O(n) iterate", c: A, note: "insertion order kept", ex: "d = {'a': 1, 'b': 2}\nfor k, v in d.items():\n    print(k, v)" },
      { op: "Counter(xs)", cost: "O(n)", c: G, note: "tally in one line", ex: "from collections import Counter\nprint(Counter('banana'))\nprint(Counter('banana').most_common(1))" },
      { op: "defaultdict(list)", cost: "O(1)*", c: G, note: "auto-creates missing keys", ex: "from collections import defaultdict\ng = defaultdict(list)\ng['a'].append(1)  # no KeyError\nprint(dict(g))" },
    ],
  },
  {
    id: "set", name: "set", mnemonic: "The bouncer's guest list — one question answered instantly: are you on it?",
    ops: [
      { op: "x in s", cost: "O(1)*", c: G, note: "the whole point", ex: "s = {1, 2, 3}\nprint(2 in s, 9 in s)" },
      { op: "s.add(x)", cost: "O(1)*", c: G, note: "duplicates ignored", ex: "s = {1, 2}\ns.add(2)\ns.add(3)\nprint(sorted(s))" },
      { op: "s.discard(x)", cost: "O(1)*", c: G, note: "no error if absent (remove errors)", ex: "s = {1, 2}\ns.discard(9)  # fine\nprint(s)" },
      { op: "a & b / a | b / a - b", cost: "O(len)", c: A, note: "intersection / union / difference", ex: "a, b = {1, 2, 3}, {2, 3, 4}\nprint(a & b)\nprint(a - b)" },
      { op: "set(lst)", cost: "O(n)", c: G, note: "dedupe (order lost)", ex: "print(sorted(set([3, 1, 2, 1, 3])))" },
    ],
  },
  {
    id: "str", name: "str", mnemonic: "Carved in stone — every 'change' secretly carves a whole new stone.",
    ops: [
      { op: "s[i] / s[a:b]", cost: "O(1) / O(k)", c: G, note: "chars are 1-char strings", ex: "s = 'python'\nprint(s[0], s[-1], s[1:4])\nprint(s[::-1])  # reversed" },
      { op: "s += ch  (in a loop)", cost: "O(n²)", c: R, note: "TRAP — copies everything each time", ex: "parts = []\nfor ch in 'abc':\n    parts.append(ch.upper())\nprint(''.join(parts))  # the O(n) way" },
      { op: "'sep'.join(parts)", cost: "O(n)", c: G, note: "the builder", ex: "print('-'.join(['a', 'b', 'c']))" },
      { op: "s.split()", cost: "O(n)", c: G, note: "no arg = any whitespace", ex: "print('the quick  fox'.split())\nprint('a,b,c'.split(','))" },
      { op: "s.lower()/strip()/replace()", cost: "O(n)", c: A, note: "all return NEW strings", ex: "s = '  Hello  '\nprint(s.strip().lower())\nprint(s)  # unchanged!" },
      { op: "f'{x}'", cost: "—", c: G, note: "f-strings for output", ex: "name, n = 'Shanky', 3\nprint(f'{name} solved {n} today')" },
    ],
  },
  {
    id: "tuple", name: "tuple", mnemonic: "A list in a glass case — look, don't touch. The glass is what makes it a valid dict key.",
    ops: [
      { op: "t[i]", cost: "O(1)", c: G, note: "same access as list", ex: "t = (3, 7)\nprint(t[0])" },
      { op: "(r, c) as dict key", cost: "O(1)*", c: G, note: "THE grid-problem idiom", ex: "seen = {(0, 0): True}\nprint((0, 0) in seen)\nprint((1, 1) in seen)" },
      { op: "a, b = b, a", cost: "O(1)", c: G, note: "unpacking = free swap", ex: "a, b = 1, 2\na, b = b, a\nprint(a, b)" },
      { op: "(x,)", cost: "—", c: A, note: "one-element tuple NEEDS the comma", ex: "t1 = (5)    # just an int!\nt2 = (5,)   # a tuple\nprint(type(t1).__name__, type(t2).__name__)" },
    ],
  },
  {
    id: "deque", name: "deque", mnemonic: "A line you can serve from both ends — the queue that list.pop(0) wishes it was.",
    ops: [
      { op: "dq.popleft()", cost: "O(1)", c: G, note: "why deque exists — BFS lives here", ex: "from collections import deque\nq = deque([1, 2, 3])\nprint(q.popleft())\nprint(q)" },
      { op: "dq.append / appendleft", cost: "O(1)", c: G, note: "both ends cheap", ex: "from collections import deque\ndq = deque([2])\ndq.append(3)\ndq.appendleft(1)\nprint(list(dq))" },
      { op: "dq[i] (middle)", cost: "O(n)", c: R, note: "NOT random access", ex: "from collections import deque\n# fine for ends, slow for middles\ndq = deque(range(5))\nprint(dq[0], dq[-1])" },
    ],
  },
  {
    id: "heapq", name: "heapq", mnemonic: "A podium that always keeps the current champion on top — min on top, everything else loosely arranged.",
    ops: [
      { op: "heappush(h, x)", cost: "O(log n)", c: A, note: "repair one path", ex: "import heapq\nh = []\nfor x in [5, 1, 3]:\n    heapq.heappush(h, x)\nprint(h[0])  # min, always" },
      { op: "heappop(h)", cost: "O(log n)", c: A, note: "removes the min", ex: "import heapq\nh = [1, 3, 5]\nheapq.heapify(h)\nprint(heapq.heappop(h))\nprint(heapq.heappop(h))" },
      { op: "h[0]", cost: "O(1)", c: G, note: "peek the min", ex: "import heapq\nh = [4, 9, 2]\nheapq.heapify(h)\nprint(h[0])" },
      { op: "push -x for max-heap", cost: "—", c: A, note: "negate in, negate out", ex: "import heapq\nh = []\nfor x in [5, 1, 9]:\n    heapq.heappush(h, -x)\nprint(-heapq.heappop(h))  # max" },
    ],
  },
  {
    id: "idioms", name: "idioms & slicing", mnemonic: "The moves that make Python read like Python — fluency here is visible seniority.",
    ops: [
      { op: "enumerate(xs)", cost: "O(n)", c: G, note: "index + value together", ex: "for i, x in enumerate(['a', 'b', 'c']):\n    print(i, x)" },
      { op: "zip(a, b)", cost: "O(n)", c: G, note: "parallel walk, stops at shorter", ex: "for name, score in zip(['x', 'y'], [1, 2]):\n    print(name, score)" },
      { op: "[f(x) for x in xs if cond]", cost: "O(n)", c: G, note: "comprehension", ex: "print([x * x for x in range(8) if x % 2 == 0])" },
      { op: "lst[::-1] / lst[::2]", cost: "O(n)", c: A, note: "step slicing (copies)", ex: "lst = [0, 1, 2, 3, 4, 5]\nprint(lst[::-1])\nprint(lst[::2])" },
      { op: "max(xs, key=f)", cost: "O(n)", c: G, note: "argmax by any rule", ex: "words = ['hi', 'hello', 'hey']\nprint(max(words, key=len))" },
      { op: "sorted(xs, key=lambda ...)", cost: "O(n log n)", c: A, note: "tuple keys = multi-sort", ex: "pairs = [(1, 'b'), (1, 'a'), (0, 'z')]\nprint(sorted(pairs))  # lexicographic" },
      { op: "b = a  vs  b = a[:]", cost: "O(1) / O(n)", c: R, note: "ALIAS vs COPY — the trap", ex: "a = [1, 2]\nb = a        # same object!\nb.append(3)\nprint(a)     # [1, 2, 3]\nc = a[:]     # real copy\nc.append(4)\nprint(a)     # unchanged" },
    ],
  },
];

/* ============ TASKS (executed & asserted) ============ */
const TASKS = [
  { id: "rev", prompt: "Reverse lst IN PLACE (the variable lst itself must end up reversed).", setup: "lst = [1, 2, 3, 4, 5]", check: "lst == [5, 4, 3, 2, 1]", hint: "lst.reverse() — or lst[:] = lst[::-1]. Note: lst = lst[::-1] also passes here, but know the difference.", starter: "# lst = [1, 2, 3, 4, 5] is already defined\n" },
  { id: "freq", prompt: "Build a dict named counts mapping each character of s to how many times it appears.", setup: "s = 'banana'", check: "counts == {'b': 1, 'a': 3, 'n': 2}", hint: "The counting idiom: counts[ch] = counts.get(ch, 0) + 1 — or Counter(s) cast to dict.", starter: "# s = 'banana' is already defined\ncounts = {}\n" },
  { id: "sq", prompt: "Build a list named out of squares of the EVEN numbers in nums, in order.", setup: "nums = [1, 2, 3, 4, 5, 6]", check: "out == [4, 16, 36]", hint: "One comprehension: [x*x for x in nums if x % 2 == 0]", starter: "# nums = [1, 2, 3, 4, 5, 6]\n" },
  { id: "merge", prompt: "Merge d1 and d2 into a new dict named merged — d2's values win on conflicts.", setup: "d1 = {'a': 1, 'b': 2}\nd2 = {'b': 99, 'c': 3}", check: "merged == {'a': 1, 'b': 99, 'c': 3} and d1 == {'a': 1, 'b': 2}", hint: "merged = {**d1, **d2} — or copy d1 then .update(d2). d1 must stay untouched.", starter: "# d1, d2 are defined\n" },
  { id: "dedupe", prompt: "Build out: lst with duplicates removed, FIRST occurrence order preserved.", setup: "lst = [3, 1, 3, 2, 1, 4]", check: "out == [3, 1, 2, 4]", hint: "set(lst) loses order. Walk lst with a seen-set, appending only new items.", starter: "# lst = [3, 1, 3, 2, 1, 4]\n" },
  { id: "swap", prompt: "Swap the values of a and b. No third variable.", setup: "a, b = 10, 20", check: "a == 20 and b == 10", hint: "Tuple unpacking: a, b = b, a", starter: "# a = 10, b = 20\n" },
  { id: "tail", prompt: "Set tail to the LAST three elements of lst (as a list).", setup: "lst = [1, 2, 3, 4, 5, 6, 7]", check: "tail == [5, 6, 7]", hint: "Negative slicing: lst[-3:]", starter: "# lst = [1..7]\n" },
  { id: "bylen", prompt: "Build out: words sorted by LENGTH, shortest first (ties keep original order).", setup: "words = ['kettlebell', 'row', 'fast', 'om']", check: "out == ['om', 'row', 'fast', 'kettlebell']", hint: "sorted(words, key=len) — Timsort is stable, ties stay put.", starter: "# words is defined\n" },
  { id: "sumv", prompt: "Set total to the sum of all VALUES in dict d.", setup: "d = {'a': 5, 'b': 7, 'c': 3}", check: "total == 15", hint: "sum(d.values())", starter: "# d is defined\n" },
  { id: "common", prompt: "Set common to a SET of elements that appear in both a and b.", setup: "a = [1, 2, 3, 4]\nb = [3, 4, 5]", check: "common == {3, 4}", hint: "set(a) & set(b)", starter: "# a, b are lists\n" },
  { id: "inv", prompt: "Build inv: dict d inverted (values become keys, keys become values).", setup: "d = {'a': 1, 'b': 2, 'c': 3}", check: "inv == {1: 'a', 2: 'b', 3: 'c'}", hint: "Comprehension over items: {v: k for k, v in d.items()}", starter: "# d is defined\n" },
  { id: "grid", prompt: "Add the cell (2, 3) to the set named seen, then set found to whether (2, 3) is in seen.", setup: "seen = {(0, 0), (1, 1)}", check: "found == True and (2, 3) in seen", hint: "Tuples are hashable — seen.add((2, 3)). This is the grid-problem idiom.", starter: "# seen is a set of (row, col) tuples\n" },
];

/* ============ RAPID FIRE: PREDICT ============ */
const PREDICT = [
  { code: "a = [1, 2]\nb = a\nb.append(3)\nprint(a)", opts: ["[1, 2]", "[1, 2, 3]", "[3]", "Error"], a: 1, why: "b = a is an ALIAS, not a copy — both names point at the same list." },
  { code: "print([1, 2, 3, 4][1:3])", opts: ["[1, 2, 3]", "[2, 3]", "[2, 3, 4]", "[1, 2]"], a: 1, why: "Slices exclude their end: indices 1 and 2 only." },
  { code: "print('hello'[-2])", opts: ["o", "l", "e", "Error"], a: 1, why: "-1 is 'o', -2 is 'l'. Negative indexing counts from the end." },
  { code: "d = {'a': 1}\nprint(d.get('b', 0))", opts: ["None", "KeyError", "0", "'b'"], a: 2, why: ".get returns the default on a miss — no exception." },
  { code: "lst = [3, 1, 2]\nprint(lst.sort())", opts: ["[1, 2, 3]", "None", "[3, 1, 2]", "Error"], a: 1, why: "TRAP: .sort() sorts in place and returns None. sorted() returns the list." },
  { code: "print(list(range(2, 8, 2)))", opts: ["[2, 4, 6, 8]", "[2, 4, 6]", "[4, 6, 8]", "[2, 3, 4, 5, 6, 7]"], a: 1, why: "Start 2, step 2, STOP BEFORE 8." },
  { code: "print(7 // 2, 7 % 2)", opts: ["3.5 1", "3 1", "3 0", "4 1"], a: 1, why: "// is floor division (int), % is remainder. The mid = (lo+hi)//2 operator." },
  { code: "s = 'abc'\ns2 = s.upper()\nprint(s)", opts: ["ABC", "abc", "Abc", "Error"], a: 1, why: "Strings are immutable — .upper() returns a NEW string; s is untouched." },
  { code: "print(len(set([1, 2, 2, 3, 3, 3])))", opts: ["6", "3", "2", "1"], a: 1, why: "Sets dedupe: {1, 2, 3} → length 3." },
  { code: "for i, x in enumerate(['a', 'b'], start=1):\n    print(i, x)", opts: ["0 a / 1 b", "1 a / 2 b", "a 1 / b 2", "Error"], a: 1, why: "enumerate's start parameter shifts the counter." },
  { code: "print([x * 2 for x in range(4) if x > 1])", opts: ["[0, 2, 4, 6]", "[4, 6]", "[2, 3]", "[2, 4, 6]"], a: 1, why: "Filter first (x>1 → 2,3), then transform (→ 4,6)." },
  { code: "a = (1, 2)\na[0] = 9\nprint(a)", opts: ["(9, 2)", "[9, 2]", "TypeError", "(1, 2)"], a: 2, why: "Tuples are immutable — item assignment raises TypeError." },
  { code: "d = {}\nd[(1, 2)] = 'x'\nprint(d[(1, 2)])", opts: ["x", "KeyError", "TypeError", "(1, 2)"], a: 0, why: "Tuples are hashable → valid dict keys. (Lists would raise TypeError.)" },
  { code: "lst = [1, 2, 3]\nlst.append([4, 5])\nprint(len(lst))", opts: ["5", "4", "3", "Error"], a: 1, why: "append adds ONE element (the whole list). extend would add 4 and 5 separately." },
  { code: "print('a,b,,c'.split(','))", opts: ["['a','b','c']", "['a','b','','c']", "['a','b',None,'c']", "Error"], a: 1, why: "split(',') keeps empty strings between consecutive separators." },
  { code: "print(bool([]), bool([0]))", opts: ["False False", "False True", "True True", "True False"], a: 1, why: "Empty containers are falsy; a list CONTAINING 0 is non-empty → truthy." },
  { code: "x = [0] * 3\nx[0] = 9\nprint(x)", opts: ["[9, 9, 9]", "[9, 0, 0]", "[0, 0, 0]", "Error"], a: 1, why: "Multiplying flat values is safe. (Nested: [[0]*2]*2 WOULD share rows — the deeper trap.)" },
  { code: "g = [[0] * 2] * 2\ng[0][0] = 9\nprint(g)", opts: ["[[9, 0], [0, 0]]", "[[9, 0], [9, 0]]", "[[9, 9], [9, 9]]", "Error"], a: 1, why: "THE grid trap: * copies the REFERENCE — both rows are the same list. Build grids with a comprehension." },
  { code: "print(sorted([(2, 'a'), (1, 'b'), (1, 'a')]))", opts: ["[(1,'a'),(1,'b'),(2,'a')]", "[(1,'b'),(1,'a'),(2,'a')]", "[(2,'a'),(1,'b'),(1,'a')]", "Error"], a: 0, why: "Tuples compare lexicographically: first element, then second on ties." },
  { code: "def f(x, acc=[]):\n    acc.append(x)\n    return acc\nprint(f(1))\nprint(f(2))", opts: ["[1] / [2]", "[1] / [1, 2]", "[1, 2] / [1, 2]", "Error"], a: 1, why: "THE mutable-default trap: the default list is created ONCE and shared across calls. Use acc=None." },
];

/* ============ RAPID FIRE: SPOT THE BUG ============ */
const BUGS = [
  { lines: ["def total(nums):", "    s = 0", "    for x in nums", "        s += x", "    return s"], bad: 2, why: "Missing ':' after the for statement." },
  { lines: ["x = 5", "if x = 5:", "    print('five')"], bad: 1, why: "= assigns; == compares. The interview classic." },
  { lines: ["lst = [3, 1, 2]", "lst = lst.sort()", "print(lst[0])"], bad: 1, why: ".sort() returns None — lst is now None and line 3 crashes. Just call lst.sort()." },
  { lines: ["d = {}", "key = [1, 2]", "d[key] = 'x'"], bad: 2, why: "Lists are unhashable — can't be dict keys. Use a tuple: d[(1, 2)]." },
  { lines: ["s = 'hello'", "s[0] = 'H'", "print(s)"], bad: 1, why: "Strings are immutable — item assignment is a TypeError. Build a new string." },
  { lines: ["def f(n):", "    if n <= 1:", "        return 1", "    return n * f(n)"], bad: 3, why: "f(n) never shrinks — infinite recursion. Must be f(n - 1): every call moves toward the base case." },
  { lines: ["seen = set()", "for x in [1, 2, 2]:", "    seen.append(x)"], bad: 2, why: "Sets use .add(), not .append(). (append is the list method.)" },
  { lines: ["from collections import deque", "q = deque([1, 2, 3])", "first = q.pop(0)"], bad: 2, why: "deque.pop() takes no index — the left end is popleft(). (list.pop(0) works but is O(n).)" },
  { lines: ["nums = [1, 2, 3]", "for i in range(len(nums)):", "    print(nums[i + 1])"], bad: 2, why: "Off-by-one: at i = len-1, nums[i+1] is out of range. The last index is len − 1." },
  { lines: ["def bt(path, i):", "    if i == 3:", "        out.append(path)", "        return"], bad: 2, why: "Appending the LIVE list — every stored result mutates later. Must copy: out.append(path[:])." },
  { lines: ["total = 0", "for k in d:", "    total += d.value[k]"], bad: 2, why: "It's d[k] to read a value — .value isn't a thing (and .values() is the iterator of all of them)." },
  { lines: ["while lo < hi:", "    mid = (lo + hi) / 2", "    if a[mid] < t:", "        lo = mid + 1"], bad: 1, why: "/ gives a float — a[3.5] crashes. Floor division: (lo + hi) // 2." },
];

/* ============ RAPID FIRE: ONE-LINERS (Pyodide-verified) ============ */
const ONELINERS = [
  { prompt: "Expression: the longest word in words", setup: "words = ['row', 'kettlebell', 'fast']", check: "_ans == 'kettlebell'", hint: "max(words, key=len)" },
  { prompt: "Expression: nums sorted DESCENDING (new list)", setup: "nums = [3, 1, 4, 1, 5]", check: "_ans == [5, 4, 3, 1, 1]", hint: "sorted(nums, reverse=True)" },
  { prompt: "Expression: sum of the EVEN numbers in nums", setup: "nums = [1, 2, 3, 4, 5, 6]", check: "_ans == 12", hint: "sum(x for x in nums if x % 2 == 0)" },
  { prompt: "Expression: how many times 'a' appears in s", setup: "s = 'banana'", check: "_ans == 3", hint: "s.count('a')" },
  { prompt: "Expression: list of keys in d whose value is > 2", setup: "d = {'a': 1, 'b': 3, 'c': 5}", check: "sorted(_ans) == ['b', 'c']", hint: "[k for k, v in d.items() if v > 2]" },
  { prompt: "Expression: the words joined with '-'", setup: "words = ['go', 'all', 'in']", check: "_ans == 'go-all-in'", hint: "'-'.join(words)" },
  { prompt: "Expression: a set of elements common to a and b", setup: "a = [1, 2, 3]\nb = [2, 3, 4]", check: "_ans == {2, 3}", hint: "set(a) & set(b)" },
  { prompt: "Expression: the last 2 characters of s", setup: "s = 'python'", check: "_ans == 'on'", hint: "s[-2:]" },
  { prompt: "Expression: list of (index, value) pairs of xs", setup: "xs = ['a', 'b']", check: "_ans == [(0, 'a'), (1, 'b')]", hint: "list(enumerate(xs))" },
  { prompt: "Expression: a dict mapping each word to its length", setup: "words = ['om', 'row']", check: "_ans == {'om': 2, 'row': 3}", hint: "{w: len(w) for w in words}" },
];

/* ============ STORAGE ============ */
const KEY = "python-bench-progress-v1";
const EMPTY = { tasks: [], predict: { right: 0, total: 0, best: 0 }, bug: { right: 0, total: 0, best: 0 }, oneliner: { right: 0, total: 0, best: 0 } };
async function load() { try { const r = await window.storage.get(KEY); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function save(p) { try { await window.storage.set(KEY, JSON.stringify(p)); } catch { } }

/* ============ ATOMS ============ */
function Tag({ c, children }) {
  const map = { g: [C.greenSoft, C.green], a: [C.amberSoft, C.amber], r: [C.redSoft, C.red] };
  const [bg, fg] = map[c];
  return <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ fontFamily: MONO, background: bg, color: fg }}>{children}</span>;
}
function Btn({ onClick, primary, danger, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} className="px-4 py-2 rounded text-xs font-semibold"
      style={{
        background: disabled ? C.panel2 : primary ? C.cyan : C.panel2,
        color: disabled ? "#4A5266" : primary ? "#0B0E14" : danger ? C.red : C.text,
        border: `1px solid ${disabled ? C.line : primary ? C.cyan : C.line}`,
        fontFamily: MONO, transition: "all 150ms",
      }}>{children}</button>
  );
}
function Note({ color, label, children }) {
  return (
    <div className="rounded p-3 text-sm leading-relaxed" style={{ background: C.deep, border: `1px solid ${C.line}`, borderLeft: `3px solid ${color}`, color: C.text }}>
      <span style={{ color, fontFamily: MONO, fontSize: "0.7rem" }}>{label} ▸ </span>{children}
    </div>
  );
}

/* ============ EDITOR ============ */
function Editor({ pyStatus, seed, onSeedUsed }) {
  const [code, setCode] = useState("# Write Python. Run it. Real interpreter, real errors.\nnums = [3, 1, 4, 1, 5]\nprint(sorted(set(nums)))\n");
  const [out, setOut] = useState(null); // {ok, out, err}
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seed) { setCode(seed); setOut(null); onSeedUsed(); }
  }, [seed, onSeedUsed]);

  const run = async () => {
    setBusy(true);
    if (pyStatus === "ready") {
      const res = await runPython(code);
      setOut(res);
    } else {
      const err = heuristicCheck(code);
      setOut({ ok: !err, out: err ? "" : "(heuristic mode — no execution; syntax looks plausible)", err });
    }
    setBusy(false);
  };

  return (
    <div className="rounded-lg p-4 sm:p-5 flex flex-col gap-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-baseline justify-between">
        <div className="text-base font-bold" style={{ color: C.text }}>Scratch editor</div>
        <span className="text-xs" style={{ fontFamily: MONO, color: pyStatus === "ready" ? C.green : pyStatus === "loading" ? C.amber : C.red }}>
          {pyStatus === "ready" ? "● CPython ready" : pyStatus === "loading" ? "◌ interpreter loading…" : "○ heuristic mode (interpreter unavailable)"}
        </span>
      </div>
      <textarea value={code} onChange={e => setCode(e.target.value)} spellCheck={false} rows={10}
        className="w-full rounded p-3 text-sm resize-y"
        style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${C.line}`, color: C.text, outline: "none", lineHeight: 1.7, tabSize: 4 }} />
      <div className="flex gap-2">
        <Btn primary onClick={run} disabled={busy || pyStatus === "loading"}>{busy ? "running…" : "▶ run"}</Btn>
        <Btn onClick={() => { setCode(""); setOut(null); }}>clear</Btn>
      </div>
      {out && (
        <div className="rounded p-3 text-sm" style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${out.err ? C.red : C.green}`, whiteSpace: "pre-wrap" }}>
          {out.err
            ? <span style={{ color: C.red }}>{out.err}</span>
            : <span style={{ color: out.out.trim() ? C.text : C.dim }}>{out.out.trim() ? out.out : "(ran clean — no output. print() something to see it.)"}</span>}
        </div>
      )}
    </div>
  );
}

/* ============ CARDS PAGE ============ */
function CardsPage({ onTry }) {
  const [openId, setOpenId] = useState("list");
  return (
    <div className="flex flex-col gap-3">
      <Note color={C.cyan} label="HOW TO USE">
        Green = reach for it freely. Amber = fine, know the cost. Red = a trap with a better tool. Tap any operation to see runnable code; "try it" drops it into the editor.
      </Note>
      {CARDS.map(card => (
        <div key={card.id} className="rounded-lg" style={{ background: C.panel, border: `1px solid ${openId === card.id ? C.cyan : C.line}` }}>
          <button onClick={() => setOpenId(openId === card.id ? null : card.id)} className="w-full text-left p-4">
            <div className="flex items-center justify-between">
              <span className="text-base font-bold" style={{ fontFamily: MONO, color: openId === card.id ? C.cyan : C.text }}>{card.name}</span>
              <span style={{ color: C.dim }}>{openId === card.id ? "−" : "+"}</span>
            </div>
            <div className="text-xs mt-1 leading-relaxed" style={{ color: C.dim }}>{card.mnemonic}</div>
          </button>
          {openId === card.id && (
            <div className="px-4 pb-4 flex flex-col gap-2">
              {card.ops.map((o, i) => <OpRow key={i} o={o} onTry={onTry} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function OpRow({ o, onTry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded" style={{ background: C.deep, border: `1px solid ${C.line}` }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
        <span className="text-sm flex-1" style={{ fontFamily: MONO, color: C.text }}>{o.op}</span>
        <Tag c={o.c}>{o.cost}</Tag>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="text-xs mb-2" style={{ color: C.dim }}>{o.note}</div>
          <pre className="rounded p-3 text-xs overflow-x-auto mb-2" style={{ fontFamily: MONO, background: "#080B11", border: `1px solid ${C.line}`, color: C.cyan, lineHeight: 1.7 }}>{o.ex}</pre>
          <Btn onClick={() => onTry(o.ex)}>try it in the editor →</Btn>
        </div>
      )}
    </div>
  );
}

/* ============ TASKS PAGE ============ */
function TasksPage({ pyStatus, progress, onDone }) {
  const [idx, setIdx] = useState(0);
  const t = TASKS[idx];
  const [code, setCode] = useState(t.starter);
  const [res, setRes] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setCode(TASKS[idx].starter); setRes(null); setShowHint(false); }, [idx]);

  const submit = async () => {
    if (pyStatus !== "ready") { setRes({ err: "Interpreter not loaded — tasks need real execution. Reload, or use the Cards/Rapid Fire tabs meanwhile." }); return; }
    setBusy(true);
    const r = await runPython(code, t.setup, t.check);
    setRes(r);
    if (r.check === true) onDone(t.id);
    setBusy(false);
  };

  const done = progress.tasks.includes(t.id);
  return (
    <div className="rounded-lg p-4 sm:p-5 flex flex-col gap-3" style={{ background: C.panel, border: `1px solid ${done ? C.green : C.line}` }}>
      <div className="flex items-center justify-between">
        <div className="text-base font-bold" style={{ color: C.text }}>Task {idx + 1} / {TASKS.length} {done && <span className="text-xs ml-2" style={{ color: C.green, fontFamily: MONO }}>✓ done</span>}</div>
        <div className="flex gap-2">
          <Btn onClick={() => setIdx(i => (i - 1 + TASKS.length) % TASKS.length)}>←</Btn>
          <Btn onClick={() => setIdx(i => (i + 1) % TASKS.length)}>→</Btn>
        </div>
      </div>
      <div className="text-sm leading-relaxed" style={{ color: C.text }}>{t.prompt}</div>
      <pre className="rounded p-3 text-xs" style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${C.line}`, color: C.dim }}>{"# given:\n" + t.setup}</pre>
      <textarea value={code} onChange={e => { setCode(e.target.value); setRes(null); }} spellCheck={false} rows={6}
        className="w-full rounded p-3 text-sm resize-y"
        style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${C.line}`, color: C.text, outline: "none", lineHeight: 1.7 }} />
      <div className="flex flex-wrap gap-2">
        <Btn primary onClick={submit} disabled={busy || pyStatus === "loading"}>{busy ? "checking…" : "submit — run & assert"}</Btn>
        <Btn onClick={() => setShowHint(s => !s)}>{showHint ? "hide hint" : "hint"}</Btn>
      </div>
      {showHint && <Note color={C.amber} label="HINT">{t.hint}</Note>}
      {res && (
        res.err ? <Note color={C.red} label="ERROR">{res.err}</Note>
          : res.check === true ? <Note color={C.green} label="PASS">Assertion holds — your code did exactly what was asked. Now type it once more from a blank line, faster.</Note>
            : <Note color={C.red} label="RAN, BUT">No errors — yet the assertion <span style={{ fontFamily: MONO, color: C.cyan }}>{t.check}</span> is false. Check what your variables actually hold (print them).</Note>
      )}
    </div>
  );
}

/* ============ RAPID FIRE ============ */
function RapidFire({ pyStatus, progress, onScore }) {
  const [mode, setMode] = useState(null); // 'predict' | 'bug' | 'oneliner'
  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState(null);
  const [typed, setTyped] = useState("");
  const [olRes, setOlRes] = useState(null);
  const timer = useRef(null);
  const running = mode !== null && timeLeft > 0;

  const bank = mode === "predict" ? PREDICT : mode === "bug" ? BUGS : ONELINERS;
  const item = bank.length ? bank[order[pos % Math.max(1, order.length)] ?? 0] : null;

  const start = (m) => {
    const b = m === "predict" ? PREDICT : m === "bug" ? BUGS : ONELINERS;
    setMode(m); setScore(0); setStreak(0); setPos(0); setPicked(null); setTyped(""); setOlRes(null);
    setOrder([...b.keys()].sort(() => Math.random() - 0.5));
    setTimeLeft(60);
  };

  useEffect(() => {
    if (running) {
      timer.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
      return () => clearInterval(timer.current);
    }
  }, [running]);

  useEffect(() => {
    if (mode && timeLeft === 0) onScore(mode, score, score, score + 0); // finalize best below in answer handler totals
  }, [timeLeft]); // eslint-disable-line

  const answer = (ok) => {
    onScore(mode, ok ? 1 : 0, 1, ok ? score + 1 : score);
    setScore(s => s + (ok ? 1 : 0));
    setStreak(s => ok ? s + 1 : 0);
  };
  const next = () => { setPicked(null); setTyped(""); setOlRes(null); setPos(p => p + 1); };

  const checkOneliner = async () => {
    if (pyStatus !== "ready") { setOlRes({ err: "needs the interpreter" }); return; }
    const r = await runPython("_ans = (" + typed + ")", item.setup, item.check);
    const ok = r.check === true && !r.err;
    setOlRes(r.err ? { err: r.err } : { ok });
    answer(ok);
  };

  if (!mode || timeLeft <= 0) {
    return (
      <div className="flex flex-col gap-3">
        {mode && timeLeft <= 0 && (
          <Note color={score >= 8 ? C.green : C.amber} label="ROUND OVER">
            {score} correct in 60 seconds{streak > 2 ? `, best streak in round: solid` : ""}. {score >= 8 ? "That's fluency forming." : "Speed comes from reps — again."}
          </Note>
        )}
        <Note color={C.cyan} label="RAPID FIRE">
          60 seconds on the clock. Answer as many as you can — speed of recall is the skill, not just correctness. Pressure on purpose.
        </Note>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { m: "predict", t: "Predict the output", d: "Aliasing, slicing, mutation traps — read code like the machine.", best: progress.predict.best },
            { m: "bug", t: "Spot the bug", d: "One broken line per snippet. Tap it.", best: progress.bug.best },
            { m: "oneliner", t: "Write the one-liner", d: "Type the expression — verified by real execution.", best: progress.oneliner.best, needsPy: true },
          ].map(x => (
            <button key={x.m} onClick={() => start(x.m)} disabled={x.needsPy && pyStatus !== "ready"}
              className="rounded-lg p-4 text-left"
              style={{ background: C.panel, border: `1px solid ${C.line}`, opacity: x.needsPy && pyStatus !== "ready" ? 0.5 : 1 }}>
              <div className="text-sm font-bold mb-1" style={{ color: C.cyan, fontFamily: MONO }}>{x.t}</div>
              <div className="text-xs leading-relaxed mb-2" style={{ color: C.dim }}>{x.d}</div>
              <div className="text-xs" style={{ fontFamily: MONO, color: C.amber }}>best: {x.best}{x.needsPy && pyStatus !== "ready" ? " · waiting for interpreter" : ""}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-4 sm:p-5 flex flex-col gap-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between text-xs" style={{ fontFamily: MONO }}>
        <span style={{ color: timeLeft <= 10 ? C.red : C.amber }}>⏱ {timeLeft}s</span>
        <span style={{ color: C.green }}>score {score}</span>
        <span style={{ color: streak >= 3 ? C.cyan : C.dim }}>streak {streak}{streak >= 3 ? " 🔥" : ""}</span>
        <button onClick={() => setTimeLeft(0)} style={{ color: C.dim }}>end</button>
      </div>

      {mode === "predict" && item && (
        <>
          <pre className="rounded p-3 text-sm overflow-x-auto" style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${C.line}`, color: C.text, lineHeight: 1.7 }}>{item.code}</pre>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {item.opts.map((o, i) => {
              let bg = C.panel2, bd = C.line, fg = C.text;
              if (picked !== null) {
                if (i === item.a) { bg = C.greenSoft; bd = C.green; fg = C.green; }
                else if (i === picked) { bg = C.redSoft; bd = C.red; fg = C.red; }
                else fg = C.dim;
              }
              return <button key={i} onClick={() => { if (picked === null) { setPicked(i); answer(i === item.a); } }}
                className="rounded px-3 py-2.5 text-sm text-left" style={{ fontFamily: MONO, background: bg, border: `1px solid ${bd}`, color: fg }}>{o}</button>;
            })}
          </div>
          {picked !== null && <Note color={picked === item.a ? C.green : C.red} label={picked === item.a ? "RIGHT" : "THE WHY"}>{item.why}</Note>}
          {picked !== null && <Btn primary onClick={next}>next →</Btn>}
        </>
      )}

      {mode === "bug" && item && (
        <>
          <div className="text-xs" style={{ color: C.dim }}>Tap the broken line:</div>
          <div className="rounded overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
            {item.lines.map((ln, i) => {
              let bg = C.deep, fg = C.text;
              if (picked !== null) {
                if (i === item.bad) { bg = C.redSoft; fg = C.red; }
                else if (i === picked && picked !== item.bad) { bg = C.amberSoft; fg = C.amber; }
              }
              return <button key={i} onClick={() => { if (picked === null) { setPicked(i); answer(i === item.bad); } }}
                className="w-full text-left px-3 py-2 text-sm block" style={{ fontFamily: MONO, background: bg, color: fg, borderBottom: i < item.lines.length - 1 ? `1px solid ${C.line}` : "none", whiteSpace: "pre" }}>
                <span style={{ color: C.dim, marginRight: 12 }}>{i + 1}</span>{ln}
              </button>;
            })}
          </div>
          {picked !== null && <Note color={picked === item.bad ? C.green : C.red} label={picked === item.bad ? "FOUND IT" : "LINE " + (item.bad + 1)}>{item.why}</Note>}
          {picked !== null && <Btn primary onClick={next}>next →</Btn>}
        </>
      )}

      {mode === "oneliner" && item && (
        <>
          <div className="text-sm leading-relaxed" style={{ color: C.text }}>{item.prompt}</div>
          <pre className="rounded p-3 text-xs" style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${C.line}`, color: C.dim }}>{"# given:\n" + item.setup}</pre>
          <div className="flex gap-2">
            <input value={typed} onChange={e => setTyped(e.target.value)} spellCheck={false}
              onKeyDown={e => { if (e.key === "Enter" && olRes === null && typed.trim()) checkOneliner(); }}
              placeholder="type the expression…"
              className="flex-1 rounded px-3 py-2.5 text-sm"
              style={{ fontFamily: MONO, background: C.deep, border: `1px solid ${C.line}`, color: C.text, outline: "none" }} />
            <Btn primary onClick={checkOneliner} disabled={olRes !== null || !typed.trim()}>check</Btn>
          </div>
          {olRes && (olRes.err
            ? <Note color={C.red} label="ERROR">{olRes.err} — hint: <span style={{ fontFamily: MONO, color: C.cyan }}>{item.hint}</span></Note>
            : olRes.ok
              ? <Note color={C.green} label="VERIFIED">Executed and asserted true. Next.</Note>
              : <Note color={C.red} label="RAN, WRONG VALUE">Valid Python, wrong result — the answer was <span style={{ fontFamily: MONO, color: C.cyan }}>{item.hint}</span></Note>)}
          {olRes && <Btn primary onClick={next}>next →</Btn>}
        </>
      )}
    </div>
  );
}

/* ============ PROGRESS ============ */
function ProgressPage({ progress, onReset }) {
  const pct = (r, t) => (t ? Math.round((100 * r) / t) + "%" : "—");
  const rows = [
    { n: "Tasks passed (executed & asserted)", v: `${progress.tasks.length} / ${TASKS.length}` },
    { n: "Predict-the-output accuracy", v: `${progress.predict.right}/${progress.predict.total} (${pct(progress.predict.right, progress.predict.total)}) · best round ${progress.predict.best}` },
    { n: "Spot-the-bug accuracy", v: `${progress.bug.right}/${progress.bug.total} (${pct(progress.bug.right, progress.bug.total)}) · best round ${progress.bug.best}` },
    { n: "One-liner accuracy", v: `${progress.oneliner.right}/${progress.oneliner.total} (${pct(progress.oneliner.right, progress.oneliner.total)}) · best round ${progress.oneliner.best}` },
  ];
  return (
    <div className="rounded-lg p-4 sm:p-5 flex flex-col gap-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="text-base font-bold" style={{ color: C.text }}>Progress</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-3 rounded px-4 py-3" style={{ background: C.deep, border: `1px solid ${C.line}` }}>
          <span className="text-sm" style={{ color: C.text }}>{r.n}</span>
          <span className="text-xs text-right" style={{ fontFamily: MONO, color: C.cyan }}>{r.v}</span>
        </div>
      ))}
      <Note color={C.amber} label="HONEST">
        Fluency target before the loop: 85%+ on predict-the-output, and every task passable twice in a row without the hint. This bench trains the alphabet; the Trace Terminal trains the sentences; the bare editor with a timer is still where the exam lives.
      </Note>
      <div><Btn danger onClick={onReset}>reset all progress</Btn></div>
    </div>
  );
}

/* ============ APP ============ */
export default function App() {
  const [tab, setTab] = useState("cards");
  const [pyStatus, setPyStatus] = useState("loading");
  const [progress, setProgress] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [seed, setSeed] = useState(null);

  useEffect(() => { bootPyodide(setPyStatus); }, []);
  useEffect(() => { (async () => { const p = await load(); if (p) setProgress({ ...EMPTY, ...p }); setLoaded(true); })(); }, []);
  useEffect(() => { if (loaded) save(progress); }, [progress, loaded]);

  const onTaskDone = (id) => setProgress(p => p.tasks.includes(id) ? p : { ...p, tasks: [...p.tasks, id] });
  const onScore = useCallback((mode, right, total, roundScore) => {
    setProgress(p => ({
      ...p,
      [mode]: {
        right: p[mode].right + right,
        total: p[mode].total + total,
        best: Math.max(p[mode].best, roundScore),
      },
    }));
  }, []);
  const trySnippet = (ex) => { setSeed(ex); setTab("editor"); };

  const tabs = [
    { id: "cards", label: "Cards" },
    { id: "editor", label: "Editor" },
    { id: "tasks", label: "Tasks" },
    { id: "rapid", label: "Rapid Fire" },
    { id: "progress", label: "Progress" },
  ];

  return (
    <div className="min-h-screen" style={{ background: C.bg, fontFamily: SANS, color: C.text }}>
      <div className="px-4 sm:px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-xs mb-1" style={{ fontFamily: MONO, color: C.cyan, letterSpacing: "0.18em" }}>THE PYTHON BENCH</div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Hands on keys. Real interpreter. Costs in colour.</h1>
          <div className="text-xs mt-1.5" style={{ color: C.dim }}>
            The building blocks under every pattern — drilled until your fingers stop thinking.
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-3 sticky top-0 z-10" style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
        <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-full text-xs font-semibold shrink-0"
              style={{
                fontFamily: MONO, letterSpacing: "0.05em",
                background: tab === t.id ? C.cyan : "transparent",
                color: tab === t.id ? "#0B0E14" : C.dim,
                border: `1px solid ${tab === t.id ? C.cyan : C.line}`,
              }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {pyStatus === "loading" && tab !== "cards" && (
            <Note color={C.amber} label="BOOTING">Real CPython is loading in your browser (~5–10s first time). Cards work meanwhile; execution unlocks when the dot turns green.</Note>
          )}
          {pyStatus === "failed" && (
            <Note color={C.red} label="DEGRADED">The interpreter couldn't load — editor falls back to heuristic syntax checks (brackets, colons, strings). Tasks and one-liners need execution; reload to retry.</Note>
          )}

          {tab === "cards" && <CardsPage onTry={trySnippet} />}
          {tab === "editor" && <Editor pyStatus={pyStatus} seed={seed} onSeedUsed={() => setSeed(null)} />}
          {tab === "tasks" && <TasksPage pyStatus={pyStatus} progress={progress} onDone={onTaskDone} />}
          {tab === "rapid" && <RapidFire pyStatus={pyStatus} progress={progress} onScore={onScore} />}
          {tab === "progress" && <ProgressPage progress={progress} onReset={() => setProgress(EMPTY)} />}

          <div className="text-center text-xs py-4" style={{ color: "#3A4254", fontFamily: MONO }}>
            green reach freely · amber know the cost · red there's a better tool
          </div>
        </div>
      </div>
    </div>
  );
}
