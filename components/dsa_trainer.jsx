import { useState, useEffect, useRef, useCallback } from "react";

/* ============ THEME ============ */
const C = {
  bg: "#0B0E14",
  panel: "#11161F",
  panel2: "#161D29",
  line: "#232B3B",
  text: "#E8E4D8",
  dim: "#8B93A7",
  amber: "#E8A33D",
  amberSoft: "rgba(232,163,61,0.14)",
  cyan: "#4FC1B6",
  cyanSoft: "rgba(79,193,182,0.13)",
  red: "#E0564B",
  redSoft: "rgba(224,86,75,0.15)",
  green: "#69C181",
  greenSoft: "rgba(105,193,129,0.14)",
  violet: "#9D8CFF",
};
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/* ============ TRACE BUILDERS ============ */
/* Each returns [{narr, ...state}] — precomputed execution tapes. */

function traceSlidingWindow() {
  const s = "abcabcbb";
  const steps = [];
  const seen = new Set();
  let left = 0, best = 0;
  steps.push({ narr: "Invariant: the window [left..right] never contains a repeat. Two fingers, both only ever move forward.", s, left: 0, right: -1, seen: [], best: 0 });
  for (let right = 0; right < s.length; right++) {
    while (seen.has(s[right])) {
      steps.push({ narr: `'${s[right]}' is already inside — invariant broken. Evict '${s[left]}' from the left and slide the left finger.`, s, left, right, seen: [...seen], best, breaking: right });
      seen.delete(s[left]);
      left++;
      steps.push({ narr: `Left finger now at ${left}. Window is "${s.slice(left, right)}" — checking again.`, s, left, right, seen: [...seen], best });
    }
    seen.add(s[right]);
    const w = right - left + 1;
    const improved = w > best;
    best = Math.max(best, w);
    steps.push({ narr: `'${s[right]}' joins the window. Width ${w}${improved ? " — new best!" : ""}. Invariant holds.`, s, left, right, seen: [...seen], best });
  }
  steps.push({ narr: `Done. Longest clean window = ${best}. Each char entered once and left at most once → O(n).`, s, left, right: s.length - 1, seen: [...seen], best, done: true });
  return steps;
}

function traceTwoSum() {
  const nums = [5, 2, 11, 7, 3, 9], target = 10;
  const steps = [];
  const seen = {};
  steps.push({ narr: `Target ${target}. Invariant: 'seen' holds every value already passed, mapped to its index. One O(1) question per element: is my partner already in there?`, nums, target, i: -1, seen: {}, });
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (need in seen) {
      steps.push({ narr: `nums[${i}]=${nums[i]} needs ${need} — and ${need} IS in seen (index ${seen[need]}). Pair found: [${seen[need]}, ${i}]. O(n) total.`, nums, target, i, seen: { ...seen }, found: [seen[need], i], done: true });
      return steps;
    }
    steps.push({ narr: `nums[${i}]=${nums[i]} needs ${need}. Not in seen yet — store ${nums[i]}→${i} and move on.`, nums, target, i, seen: { ...seen, [nums[i]]: i } });
    seen[nums[i]] = i;
  }
  return steps;
}

function traceBinarySearch() {
  const a = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target = 23;
  const steps = [];
  let lo = 0, hi = a.length;
  steps.push({ narr: `Target ${target}. Invariant: the answer, if present, always lies in [lo, hi). Half-open — hi is exclusive.`, a, lo, hi, mid: -1, target });
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] < target) {
      steps.push({ narr: `mid=${mid}, a[mid]=${a[mid]} < ${target} → everything up to mid is ruled out. lo = mid + 1. Half the space just died.`, a, lo, hi, mid, target, cut: "left" });
      lo = mid + 1;
    } else {
      steps.push({ narr: `mid=${mid}, a[mid]=${a[mid]} ≥ ${target} → mid still possible, everything after is not better. hi = mid.`, a, lo, hi, mid, target, cut: "right" });
      hi = mid;
    }
  }
  steps.push({ narr: `lo == hi == ${lo}. a[${lo}] = ${a[lo]} ${a[lo] === target ? "— found" : "— not present"}. ~log₂(n) comparisons.`, a, lo, hi, mid: lo, target, done: true });
  return steps;
}

function traceParens() {
  const s = "({[()]})";
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const steps = [];
  const st = [];
  steps.push({ narr: "Invariant: the stack holds every open bracket still waiting for its match — most recent on top.", s, i: -1, stack: [] });
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ("([{".includes(ch)) {
      st.push(ch);
      steps.push({ narr: `'${ch}' opens — push it. It now waits on top.`, s, i, stack: [...st] });
    } else {
      const top = st.pop();
      steps.push({ narr: `'${ch}' closes — the most recent open must match. Top was '${top}' ${top === pairs[ch] ? "✓ matched, pop." : "✗ mismatch!"}`, s, i, stack: [...st], match: top === pairs[ch] });
    }
  }
  steps.push({ narr: `End of string, stack empty → valid. Every char pushed/popped at most once → O(n).`, s, i: s.length - 1, stack: [...st], done: true });
  return steps;
}

function traceMonoStack() {
  const t = [73, 74, 75, 71, 69, 72, 76, 73];
  const steps = [];
  const res = new Array(t.length).fill(-1);
  const st = [];
  steps.push({ narr: "Daily temperatures. Invariant: the stack holds indices still WAITING for a warmer day, values strictly decreasing top-down.", t, i: -1, stack: [], res: [...res] });
  for (let i = 0; i < t.length; i++) {
    while (st.length && t[st[st.length - 1]] < t[i]) {
      const j = st.pop();
      res[j] = i - j;
      steps.push({ narr: `${t[i]} beats ${t[j]} (index ${j}) — day ${j} just got its answer: wait ${i - j} day(s). Pop it.`, t, i, stack: [...st], res: [...res], resolved: j });
    }
    st.push(i);
    steps.push({ narr: `Index ${i} (${t[i]}°) joins the stack and waits.`, t, i, stack: [...st], res: [...res] });
  }
  steps.push({ narr: "Done. Whoever's left waits forever (−1). Each index pushed once, popped ≤ once → O(n) despite the nested while.", t, i: t.length - 1, stack: [...st], res: [...res], done: true });
  return steps;
}

function tracePrefixSum() {
  const nums = [1, 2, 3, -2, 4], k = 3;
  const steps = [];
  const seen = { 0: 1 };
  let total = 0, count = 0;
  steps.push({ narr: `Count subarrays summing to ${k}. Note the negative — sliding window would break here. Invariant: 'seen' counts every prefix-sum so far; seed {0:1} for the empty prefix.`, nums, i: -1, total: 0, count: 0, seen: { 0: 1 } });
  for (let i = 0; i < nums.length; i++) {
    total += nums[i];
    const need = total - k;
    const hits = seen[need] || 0;
    count += hits;
    steps.push({ narr: `Prefix now ${total}. Need an earlier prefix of ${total}−${k}=${need} → seen ${hits} time(s)${hits ? " — that's " + hits + " subarray(s) ending here!" : "."} Count = ${count}.`, nums, i, total, count, seen: { ...seen }, need, hit: hits > 0 });
    seen[total] = (seen[total] || 0) + 1;
  }
  steps.push({ narr: `Answer: ${count} subarrays. One pass, O(1) dict lookups → O(n).`, nums, i: nums.length - 1, total, count, seen: { ...seen }, done: true });
  return steps;
}

function traceBFS() {
  const W = 5, H = 5;
  const walls = new Set(["1,1", "1,2", "1,3", "3,1", "3,2", "3,3"]);
  const steps = [];
  const dist = {};
  dist["0,0"] = 0;
  let frontier = [[0, 0]];
  steps.push({ narr: "Shortest path (0,0)→(4,4), walls in the way. Invariant: BFS explores in rings — every ring-d cell is reached before any ring-(d+1) cell. Gossip spreading.", W, H, walls: [...walls], dist: { ...dist }, frontier: frontier.map(c => c.join(",")), d: 0 });
  let d = 0;
  while (frontier.length) {
    const next = [];
    for (const [r, c] of frontier) {
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const nr = r + dr, nc = c + dc, key = nr + "," + nc;
        if (nr >= 0 && nr < H && nc >= 0 && nc < W && !walls.has(key) && !(key in dist)) {
          dist[key] = d + 1;
          next.push([nr, nc]);
        }
      }
    }
    if (!next.length) break;
    d++;
    steps.push({ narr: `Ring ${d}: ${next.length} new cell(s) reached, each in exactly ${d} steps — the first arrival is always via a shortest path.`, W, H, walls: [...walls], dist: { ...dist }, frontier: next.map(c => c.join(",")), d });
    frontier = next;
    if (dist["4,4"] !== undefined) {
      steps.push({ narr: `Target reached in ${dist["4,4"]} steps — guaranteed minimal. Each cell visited once, each edge once → O(V+E).`, W, H, walls: [...walls], dist: { ...dist }, frontier: [], d, done: true });
      break;
    }
  }
  return steps;
}

function traceKadane() {
  const nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4];
  const steps = [];
  let cur = nums[0], best = nums[0];
  steps.push({ narr: "Max subarray. Invariant: 'cur' = best run ENDING exactly here. The only decision: extend the past run, or start fresh.", nums, i: 0, cur, best, runStart: 0 });
  let runStart = 0;
  for (let i = 1; i < nums.length; i++) {
    const fresh = nums[i] > cur + nums[i];
    if (fresh) runStart = i;
    cur = Math.max(nums[i], cur + nums[i]);
    const improved = cur > best;
    best = Math.max(best, cur);
    steps.push({ narr: `At ${nums[i]}: ${fresh ? "the past run is dead weight — start fresh here" : "extend the run, it's still worth carrying"}. cur=${cur}${improved ? ", new best=" + best : ""}.`, nums, i, cur, best, runStart });
  }
  steps.push({ narr: `Best = ${best}. One pass, two variables — the smallest possible DP.`, nums, i: nums.length - 1, cur, best, runStart, done: true });
  return steps;
}

function traceTwoPointers() {
  const a = [1, 2, 3, 4, 5, 6];
  const steps = [];
  const arr = [...a];
  let i = 0, j = arr.length - 1;
  steps.push({ narr: "Reverse in place. Invariant: everything outside [i..j] is already in final position. Swap inward.", a: [...arr], i, j });
  while (i < j) {
    [arr[i], arr[j]] = [arr[j], arr[i]];
    steps.push({ narr: `Swap positions ${i} and ${j}. The ends are settled — move both fingers inward.`, a: [...arr], i, j, swapped: [i, j] });
    i++; j--;
  }
  steps.push({ narr: "Fingers met — done. n/2 swaps, O(1) extra space.", a: [...arr], i, j, done: true });
  return steps;
}

function traceCallStack() {
  const steps = [];
  const stack = [];
  steps.push({ narr: "factorial(4). Each pending call WAITS on the call stack — that waiting is the O(depth) space cost of recursion.", stack: [], phase: "start" });
  for (let n = 4; n >= 1; n--) {
    stack.push({ label: `factorial(${n})`, note: n === 1 ? "base case!" : `waiting on factorial(${n - 1})` });
    steps.push({ narr: n === 1 ? "factorial(1) hits the base case — returns 1. Now the waiters resolve, inside-out." : `factorial(${n}) can't answer yet — it delegates to factorial(${n - 1}) and waits.`, stack: stack.map(f => ({ ...f })) });
  }
  let val = 1;
  for (let n = 1; n <= 4; n++) {
    val = n === 1 ? 1 : val * n;
    stack.pop();
    steps.push({ narr: `factorial(${n}) returns ${val}${n < 4 ? ` — factorial(${n + 1}) multiplies by ${n + 1} and resolves next.` : ". Final answer: 24."}`, stack: stack.map(f => ({ ...f })), ret: val, done: n === 4 });
  }
  return steps;
}

function traceHeap() {
  // k largest with size-3 min-heap, conceptual array view
  const nums = [5, 1, 9, 3, 7, 6], k = 3;
  const steps = [];
  let h = [];
  const sortH = () => h.sort((a, b) => a - b);
  steps.push({ narr: `Top-${k} largest with a size-${k} MIN-heap. Invariant: the heap holds the ${k} best so far; its minimum (the top) is the bouncer — beat it or stay out.`, nums, i: -1, heap: [] });
  nums.forEach((x, i) => {
    h.push(x); sortH();
    if (h.length > k) {
      const evicted = h.shift();
      steps.push({ narr: `Push ${x}; heap over capacity — evict the smallest (${evicted}). Each op is O(log k), not log n.`, nums, i, heap: [...h], evicted });
    } else {
      steps.push({ narr: `Push ${x}. Heap holds the best ${h.length} so far; minimum on top.`, nums, i, heap: [...h] });
    }
  });
  steps.push({ narr: `Done — heap IS the answer: top ${k} = [${h.join(", ")}]. O(n log k) total, O(k) space.`, nums, i: nums.length - 1, heap: [...h], done: true });
  return steps;
}

/* ============ ALGO REGISTRY ============ */
const ALGOS = [
  { id: "window", name: "Sliding window", tag: "longest unique substring", build: traceSlidingWindow, kind: "string-window" },
  { id: "twosum", name: "Two Sum (hash)", tag: "partner lookup in O(1)", build: traceTwoSum, kind: "array-dict" },
  { id: "binsearch", name: "Binary search", tag: "halve until found", build: traceBinarySearch, kind: "array-lohi" },
  { id: "parens", name: "Stack — brackets", tag: "most recent open matches first", build: traceParens, kind: "string-stack" },
  { id: "mono", name: "Monotonic stack", tag: "daily temperatures", build: traceMonoStack, kind: "array-mono" },
  { id: "prefix", name: "Prefix sum + hash", tag: "subarray sum = k (negatives!)", build: tracePrefixSum, kind: "array-prefix" },
  { id: "bfs", name: "BFS on a grid", tag: "shortest path in rings", build: traceBFS, kind: "grid" },
  { id: "kadane", name: "Kadane (1-line DP)", tag: "max subarray", build: traceKadane, kind: "array-kadane" },
  { id: "twoptr", name: "Two pointers", tag: "reverse in place", build: traceTwoPointers, kind: "array-swap" },
  { id: "callstack", name: "Recursion — call stack", tag: "factorial(4), frame by frame", build: traceCallStack, kind: "frames" },
  { id: "heap", name: "Heap — top K", tag: "size-k bouncer", build: traceHeap, kind: "array-heap" },
];

/* ============ QUIZ DATA ============ */
const PATTERN_QS = [
  { q: "Longest substring with at most 2 distinct characters.", opts: ["Sliding window", "Prefix sum + hash", "Binary search", "DP"], a: 0, why: "Longest CONTIGUOUS run under a character condition — grow right, shrink left. O(n)." },
  { q: "Count subarrays that sum to k. Array contains negative numbers.", opts: ["Sliding window", "Prefix sum + hash", "Two pointers", "Greedy"], a: 1, why: "Negatives break the window's grow-shrink logic. Prefix identities don't care about sign." },
  { q: "Sorted array — find two numbers summing to target, O(1) space.", opts: ["Hash map", "Two pointers", "Backtracking", "Heap"], a: 1, why: "SORTED + pair + O(1) space = walk inward from both ends, discarding by order." },
  { q: "Minimum eating speed so all bananas are finished within H hours.", opts: ["Greedy", "Binary search on the answer", "DP", "BFS"], a: 1, why: "Feasibility is monotonic — if speed x works, every larger speed works. Binary-search the value space." },
  { q: "Fewest moves for a knight to reach a target square.", opts: ["DFS", "BFS", "Dijkstra", "DP"], a: 1, why: "FEWEST STEPS + unweighted moves = BFS rings. First arrival = shortest." },
  { q: "Cheapest flight route where each leg has a different price.", opts: ["BFS", "DFS", "Dijkstra", "Topological sort"], a: 2, why: "WEIGHTS. BFS counts hops; Dijkstra extends the cheapest frontier. One word decides it." },
  { q: "All possible letter combinations of a phone number.", opts: ["DP", "Backtracking", "Sliding window", "Trie"], a: 1, why: "'ALL combinations' — the output itself is exponential. Choose → recurse → un-choose." },
  { q: "COUNT the ways to climb n stairs taking 1 or 2 steps.", opts: ["Backtracking", "DP", "Greedy", "Two pointers"], a: 1, why: "COUNT (not list) with overlapping futures → solve each sub-question once. ways(n)=ways(n−1)+ways(n−2)." },
  { q: "Merge all overlapping meetings in a calendar.", opts: ["Heap", "Intervals: sort + sweep", "Union-Find", "Stack"], a: 1, why: "Sort by start; then any overlap involves only the most recently merged interval — one pass." },
  { q: "Kth largest element in a stream of numbers.", opts: ["Sort every time", "Size-k min-heap", "Binary search", "Monotonic stack"], a: 1, why: "Repeated access to an extreme with bounded memory: heap of size k, O(log k) per arrival." },
  { q: "For each day, how many days until a warmer temperature?", opts: ["Sliding window", "Monotonic stack", "Heap", "Prefix sum"], a: 1, why: "'Next greater element' — the stack holds days still waiting; a warm day resolves everyone it beats." },
  { q: "Course schedule: can all courses be finished given prerequisites?", opts: ["DFS only", "Topological sort", "Union-Find", "Greedy"], a: 1, why: "Ordering with dependencies = topo sort (Kahn's). Leftover nodes = a cycle = impossible." },
  { q: "Number of islands in a binary grid.", opts: ["BFS/DFS flood fill", "Binary search", "Sliding window", "Intervals"], a: 0, why: "Connected regions in a grid — flood fill from each unvisited land cell, O(rows·cols)." },
  { q: "Accounts keep merging — repeatedly ask 'are these two in the same group?'", opts: ["DFS each time", "Union-Find", "Heap", "Trie"], a: 1, why: "Edges arrive OVER TIME with repeated connectivity queries — that's DSU's home turf, near-O(1) amortized." },
  { q: "Implement autocomplete: all words starting with a typed prefix.", opts: ["Hash set", "Trie", "Binary search", "Heap"], a: 1, why: "Walk letter by letter down branching paths — O(L) per lookup regardless of dictionary size." },
  { q: "Longest INCREASING SUBSEQUENCE (elements may skip).", opts: ["Sliding window", "DP", "Two pointers", "Stack"], a: 1, why: "SUBSEQUENCE (not contiguous!) → almost always DP. Window/prefix-sum only apply to contiguous runs." },
  { q: "Design a structure: get and put in O(1), evict least-recently-used.", opts: ["Plain dict", "Hash map + doubly-linked list (LRU)", "Heap", "Sorted list"], a: 1, why: "Order AND lookup at once. Dict alone can't track recency in O(1); the DLL does the reordering." },
  { q: "Minimum number of intervals to remove so none overlap.", opts: ["DP", "Greedy (sort by end)", "BFS", "Hash"], a: 1, why: "Keep the earliest-ending interval — provably leaves maximal room. The exchange argument makes greedy safe here." },
];

const BIGO_QS = [
  { q: "x in my_list (membership test on a list)", opts: ["O(1)", "O(log n)", "O(n)", "O(n log n)"], a: 2, why: "A list has no index of its contents — front-to-back scan." },
  { q: "x in my_set", opts: ["O(1) avg", "O(log n)", "O(n)", "O(n²)"], a: 0, why: "Hash → bucket → jump. The coat-check." },
  { q: "my_list.pop(0)", opts: ["O(1)", "O(log n)", "O(n)", "O(n log n)"], a: 2, why: "Front removal shifts every remaining element. Use deque.popleft() for O(1)." },
  { q: "Building a string with += inside a loop over n chars", opts: ["O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"], a: 2, why: "Immutable strings: each += copies everything so far. 1+2+…+n = O(n²). Use ''.join." },
  { q: "sorted(nums)", opts: ["O(n)", "O(n log n)", "O(n²)", "O(log n)"], a: 1, why: "Timsort — the comparison-sort floor." },
  { q: "heapq.heappush on a heap of size n", opts: ["O(1)", "O(log n)", "O(n)", "O(n log n)"], a: 1, why: "Repairing one root-to-leaf path of a height-log-n tree." },
  { q: "Sliding window over n elements (with the nested while)", opts: ["O(n)", "O(n log n)", "O(n²)", "O(n³)"], a: 0, why: "Both pointers only move forward — each element touched ≤ 2 times. Count touches, not loops." },
  { q: "BFS over a graph with V vertices, E edges", opts: ["O(V·E)", "O(V+E)", "O(V log E)", "O(E²)"], a: 1, why: "Each vertex dequeued once, each edge examined a constant number of times — linear in the graph." },
  { q: "Binary search on a sorted array of one million elements — about how many steps?", opts: ["~20", "~1000", "~500,000", "~1,000,000"], a: 0, why: "log₂(10⁶) ≈ 20. Halving is brutal." },
  { q: "Generating ALL subsets of n elements", opts: ["O(n²)", "O(n log n)", "O(2ⁿ)", "O(n!)"], a: 2, why: "Each element is in or out — 2ⁿ subsets exist, so listing them can't be cheaper." },
  { q: "lst[a:b] — taking a slice of k elements", opts: ["O(1)", "O(k) time and space", "O(log k)", "free"], a: 1, why: "Slices COPY. Inside recursion this quietly builds O(n²)." },
  { q: "dict lookup, worst case (adversarial collisions)", opts: ["O(1)", "O(log n)", "O(n)", "O(n log n)"], a: 2, why: "All keys in one bucket degrades to a scan. Say 'O(1) average' and move on." },
  { q: "Constraints say n ≤ 10⁵. Which complexity is dead on arrival?", opts: ["O(n)", "O(n log n)", "O(n²)", "O(log n)"], a: 2, why: "10¹⁰ operations at ~10⁸/sec = 100 seconds. The constraints announce the target complexity." },
  { q: "Union-Find find() with path compression + rank", opts: ["O(n)", "O(log n)", "~O(1) amortized", "O(n log n)"], a: 2, why: "Inverse Ackermann — ≤ 5 for any input that fits in the universe." },
];

/* ============ DRILL DATA (fill the blanks) ============ */
const DRILLS = [
  {
    id: "window", name: "Sliding window", desc: "Longest substring without repeats — fill the four load-bearing pieces.",
    lines: [
      "def longest_unique(s):",
      "    seen = set()",
      "    left = best = 0",
      "    for right in range(len(s)):",
      ["        while ", { k: "w0", w: 16, accept: ["s[right]inseen"] }, ":"],
      ["            seen.remove(", { k: "w1", w: 9, accept: ["s[left]"] }, ")"],
      ["            left += ", { k: "w2", w: 3, accept: ["1"] }, ""],
      "        seen.add(s[right])",
      ["        best = max(best, ", { k: "w3", w: 18, accept: ["right-left+1"] }, ")"],
      "    return best",
    ],
    hints: { w0: "the invariant-breaking condition", w1: "what gets evicted", w2: "slide forward", w3: "current window width" },
  },
  {
    id: "binsearch", name: "Binary search", desc: "Leftmost position ≥ target. Half-open [lo, hi). The off-by-ones live here.",
    lines: [
      "def leftmost(a, target):",
      "    lo, hi = 0, len(a)",
      ["    while ", { k: "b0", w: 8, accept: ["lo<hi"] }, ":"],
      ["        mid = ", { k: "b1", w: 15, accept: ["(lo+hi)//2"] }, ""],
      "        if a[mid] < target:",
      ["            lo = ", { k: "b2", w: 8, accept: ["mid+1"] }, ""],
      "        else:",
      ["            hi = ", { k: "b3", w: 5, accept: ["mid"] }, ""],
      "    return lo",
    ],
    hints: { b0: "strict — guarantees termination", b1: "the midpoint, floor division", b2: "mid is ruled out", b3: "mid still possible" },
  },
  {
    id: "bfs", name: "BFS", desc: "The queue + seen skeleton. Arrival order is everything.",
    lines: [
      "from collections import deque",
      "def bfs(g, start):",
      "    seen = {start}",
      "    q = deque([start])",
      "    while q:",
      ["        node = ", { k: "f0", w: 12, accept: ["q.popleft()"] }, ""],
      "        for nb in g[node]:",
      "            if nb not in seen:",
      ["                ", { k: "f1", w: 13, accept: ["seen.add(nb)"] }, ""],
      ["                ", { k: "f2", w: 13, accept: ["q.append(nb)"] }, ""],
    ],
    hints: { f0: "FIFO — take from the FRONT", f1: "mark before queueing, not after", f2: "join the next ring" },
  },
  {
    id: "backtrack", name: "Backtracking", desc: "Subsets — choose, recurse, un-choose. Two classic bugs hide in these blanks.",
    lines: [
      "def subsets(nums):",
      "    out, path = [], []",
      "    def bt(i):",
      "        if i == len(nums):",
      ["            out.append(", { k: "k0", w: 8, accept: ["path[:]", "list(path)", "path.copy()"] }, ")"],
      "            return",
      "        bt(i + 1)",
      ["        ", { k: "k1", w: 21, accept: ["path.append(nums[i])"] }, ""],
      "        bt(i + 1)",
      ["        ", { k: "k2", w: 10, accept: ["path.pop()"] }, ""],
      "    bt(0)",
      "    return out",
    ],
    hints: { k0: "COPY it — the live list mutates later", k1: "choose", k2: "un-choose — the backtrack itself" },
  },
  {
    id: "twosum", name: "Two Sum", desc: "The canonical space-for-time trade.",
    lines: [
      "def two_sum(nums, target):",
      "    seen = {}",
      "    for i, x in enumerate(nums):",
      ["        if ", { k: "t0", w: 19, accept: ["target-xinseen"] }, ":"],
      "            return [seen[target - x], i]",
      ["        ", { k: "t1", w: 11, accept: ["seen[x]=i"] }, ""],
    ],
    hints: { t0: "is my partner already here?", t1: "remember me for future partners" },
  },
  {
    id: "kadane", name: "Kadane", desc: "The one-line DP: extend the run, or start fresh.",
    lines: [
      "def max_subarray(nums):",
      "    best = cur = nums[0]",
      "    for x in nums[1:]:",
      ["        cur = ", { k: "d0", w: 17, accept: ["max(x,cur+x)"] }, ""],
      ["        best = ", { k: "d1", w: 15, accept: ["max(best,cur)"] }, ""],
      "    return best",
    ],
    hints: { d0: "is the past run worth carrying?", d1: "record the champion" },
  },
];

/* ============ STORAGE ============ */
const STORE_KEY = "dsa-trainer-progress-v1";
async function loadProgress() {
  try {
    const r = await window.storage.get(STORE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function saveProgress(p) {
  try { await window.storage.set(STORE_KEY, JSON.stringify(p)); } catch { /* in-memory only */ }
}
const EMPTY_PROGRESS = { visited: [], pattern: { right: 0, total: 0 }, bigo: { right: 0, total: 0 }, drills: [] };

/* ============ SMALL UI ATOMS ============ */
function Cell({ ch, state, small }) {
  const styles = {
    base: { background: C.panel2, border: `1px solid ${C.line}`, color: C.dim },
    win: { background: C.amberSoft, border: `1px solid ${C.amber}`, color: C.text },
    cursor: { background: C.amber, border: `1px solid ${C.amber}`, color: "#0B0E14", fontWeight: 700 },
    left: { background: C.cyanSoft, border: `1px solid ${C.cyan}`, color: C.cyan, fontWeight: 700 },
    hot: { background: C.redSoft, border: `1px solid ${C.red}`, color: C.red, fontWeight: 700 },
    ok: { background: C.greenSoft, border: `1px solid ${C.green}`, color: C.green, fontWeight: 700 },
    dead: { background: "transparent", border: `1px solid ${C.line}`, color: "#3A4254", textDecoration: "line-through" },
  };
  return (
    <div className={`flex items-center justify-center rounded ${small ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm"}`}
      style={{ fontFamily: MONO, ...styles[state || "base"], transition: "all 200ms" }}>
      {ch}
    </div>
  );
}

function KV({ k, v, hot }) {
  return (
    <span className="inline-flex items-center rounded px-2 py-1 text-xs mr-1.5 mb-1.5"
      style={{ fontFamily: MONO, background: hot ? C.amberSoft : C.panel2, border: `1px solid ${hot ? C.amber : C.line}`, color: hot ? C.amber : C.cyan }}>
      {k}{v !== undefined && <span style={{ color: C.dim }}>→{v}</span>}
    </span>
  );
}

function Label({ children }) {
  return <div className="text-xs uppercase mb-1.5" style={{ color: C.dim, letterSpacing: "0.12em", fontFamily: MONO }}>{children}</div>;
}

/* ============ VISUAL RENDERERS ============ */
function StageFor({ algo, step }) {
  const k = algo.kind;
  if (!step) return null;

  if (k === "string-window") {
    const { s, left, right, seen, best } = step;
    return (
      <div>
        <Label>string · window in amber</Label>
        <div className="flex flex-wrap gap-1 mb-4">
          {s.split("").map((ch, i) => {
            let st = "base";
            if (i >= left && i <= right) st = "win";
            if (i === right) st = step.breaking === i ? "hot" : "cursor";
            if (i === left && right >= left) st = i === right ? st : "left";
            return <Cell key={i} ch={ch} state={st} />;
          })}
        </div>
        <div className="flex flex-wrap gap-6">
          <div><Label>seen (in window)</Label><div>{seen.length ? seen.map(c => <KV key={c} k={`'${c}'`} />) : <span className="text-xs" style={{ color: C.dim }}>empty</span>}</div></div>
          <div><Label>best</Label><div className="text-2xl" style={{ fontFamily: MONO, color: C.green }}>{best}</div></div>
        </div>
      </div>
    );
  }

  if (k === "array-dict") {
    const { nums, i, seen, found, target } = step;
    return (
      <div>
        <Label>nums · target {target}</Label>
        <div className="flex flex-wrap gap-1 mb-4">
          {nums.map((x, idx) => <Cell key={idx} ch={x} state={found && found.includes(idx) ? "ok" : idx === i ? "cursor" : idx < i ? "win" : "base"} />)}
        </div>
        <Label>seen — value → index</Label>
        <div>{Object.keys(seen).length ? Object.entries(seen).map(([kk, v]) => <KV key={kk} k={kk} v={v} />) : <span className="text-xs" style={{ color: C.dim }}>empty</span>}</div>
      </div>
    );
  }

  if (k === "array-lohi") {
    const { a, lo, hi, mid, target } = step;
    return (
      <div>
        <Label>sorted array · target {target} · live zone [lo, hi)</Label>
        <div className="flex flex-wrap gap-1 mb-3">
          {a.map((x, idx) => {
            let st = "dead";
            if (idx >= lo && idx < hi) st = "win";
            if (idx === mid && mid >= 0) st = step.done && a[idx] === target ? "ok" : "cursor";
            return <Cell key={idx} ch={x} state={st} />;
          })}
        </div>
        <div className="flex gap-5 text-xs" style={{ fontFamily: MONO, color: C.dim }}>
          <span>lo=<b style={{ color: C.cyan }}>{lo}</b></span>
          <span>hi=<b style={{ color: C.cyan }}>{hi}</b></span>
          {mid >= 0 && <span>mid=<b style={{ color: C.amber }}>{mid}</b></span>}
        </div>
      </div>
    );
  }

  if (k === "string-stack" || k === "frames") {
    const isFrames = k === "frames";
    const stack = step.stack || [];
    return (
      <div className="flex flex-wrap gap-8">
        {!isFrames && (
          <div>
            <Label>input</Label>
            <div className="flex flex-wrap gap-1">
              {step.s.split("").map((ch, idx) => <Cell key={idx} ch={ch} state={idx === step.i ? (step.match === false ? "hot" : "cursor") : idx < step.i ? "win" : "base"} />)}
            </div>
          </div>
        )}
        <div>
          <Label>{isFrames ? "call stack — top is the active call" : "stack — top is most recent"}</Label>
          <div className="flex flex-col-reverse gap-1 min-h-24">
            {stack.length === 0 && <span className="text-xs" style={{ color: C.dim }}>empty</span>}
            {stack.map((f, idx) => (
              <div key={idx} className="rounded px-3 py-1.5 text-xs"
                style={{ fontFamily: MONO, background: idx === stack.length - 1 ? C.amberSoft : C.panel2, border: `1px solid ${idx === stack.length - 1 ? C.amber : C.line}`, color: idx === stack.length - 1 ? C.amber : C.text }}>
                {isFrames ? <>{f.label} <span style={{ color: C.dim }}>· {f.note}</span></> : f}
              </div>
            ))}
          </div>
          {isFrames && step.ret !== undefined && <div className="mt-2 text-xs" style={{ fontFamily: MONO, color: C.green }}>↩ returned {step.ret}</div>}
        </div>
      </div>
    );
  }

  if (k === "array-mono") {
    const { t, i, stack, res } = step;
    return (
      <div>
        <Label>temperatures · resolved answers below</Label>
        <div className="flex flex-wrap gap-1 mb-1">
          {t.map((x, idx) => <Cell key={idx} ch={x} state={idx === i ? "cursor" : stack.includes(idx) ? "win" : idx === step.resolved ? "ok" : "base"} />)}
        </div>
        <div className="flex flex-wrap gap-1 mb-4">
          {res.map((x, idx) => <Cell key={idx} ch={x === -1 ? "·" : x} small state={x === -1 ? "base" : "ok"} />)}
        </div>
        <Label>stack (indices, waiting)</Label>
        <div>{stack.length ? stack.map(idx => <KV key={idx} k={idx} v={t[idx] + "°"} />) : <span className="text-xs" style={{ color: C.dim }}>empty</span>}</div>
      </div>
    );
  }

  if (k === "array-prefix") {
    const { nums, i, total, count, seen, need, hit } = step;
    return (
      <div>
        <Label>nums · k = 3 · note the negative</Label>
        <div className="flex flex-wrap gap-1 mb-4">
          {nums.map((x, idx) => <Cell key={idx} ch={x} state={idx === i ? "cursor" : idx < i ? "win" : "base"} />)}
        </div>
        <div className="flex flex-wrap gap-6 mb-3">
          <div><Label>prefix total</Label><div className="text-xl" style={{ fontFamily: MONO, color: C.cyan }}>{total}</div></div>
          {need !== undefined && <div><Label>needs earlier prefix</Label><div className="text-xl" style={{ fontFamily: MONO, color: hit ? C.green : C.dim }}>{need}</div></div>}
          <div><Label>count</Label><div className="text-xl" style={{ fontFamily: MONO, color: C.green }}>{count}</div></div>
        </div>
        <Label>seen — prefix → times</Label>
        <div>{Object.entries(seen).map(([kk, v]) => <KV key={kk} k={kk} v={v} hot={need !== undefined && String(need) === kk && hit} />)}</div>
      </div>
    );
  }

  if (k === "grid") {
    const { W, H, walls, dist, frontier } = step;
    const wallSet = new Set(walls);
    const frontSet = new Set(frontier);
    return (
      <div>
        <Label>grid · numbers = ring distance · amber = current frontier</Label>
        <div className="inline-flex flex-col gap-1">
          {Array.from({ length: H }, (_, r) => (
            <div key={r} className="flex gap-1">
              {Array.from({ length: W }, (_, c) => {
                const key = r + "," + c;
                if (wallSet.has(key)) return <div key={c} className="w-9 h-9 rounded" style={{ background: "#1A2030", border: `1px solid ${C.line}` }} />;
                const d = dist[key];
                const isFront = frontSet.has(key);
                const isTarget = r === 4 && c === 4;
                return <Cell key={c} ch={d === undefined ? "" : d} state={isFront ? "cursor" : isTarget && d !== undefined ? "ok" : d !== undefined ? "win" : "base"} />;
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (k === "array-kadane") {
    const { nums, i, cur, best, runStart } = step;
    return (
      <div>
        <Label>nums · amber = run ending here</Label>
        <div className="flex flex-wrap gap-1 mb-4">
          {nums.map((x, idx) => <Cell key={idx} ch={x} state={idx === i ? "cursor" : idx >= runStart && idx < i ? "win" : "base"} />)}
        </div>
        <div className="flex gap-6">
          <div><Label>cur (run ending here)</Label><div className="text-xl" style={{ fontFamily: MONO, color: C.amber }}>{cur}</div></div>
          <div><Label>best</Label><div className="text-xl" style={{ fontFamily: MONO, color: C.green }}>{best}</div></div>
        </div>
      </div>
    );
  }

  if (k === "array-swap") {
    const { a, i, j, swapped } = step;
    return (
      <div>
        <Label>array · fingers swap inward</Label>
        <div className="flex flex-wrap gap-1">
          {a.map((x, idx) => {
            let st = "base";
            if (idx < i || idx > j) st = "ok";
            if (idx === i && i <= j) st = "cursor";
            if (idx === j && i <= j) st = "left";
            if (swapped && swapped.includes(idx)) st = "hot";
            return <Cell key={idx} ch={x} state={st} />;
          })}
        </div>
      </div>
    );
  }

  if (k === "array-heap") {
    const { nums, i, heap, evicted } = step;
    return (
      <div>
        <Label>stream</Label>
        <div className="flex flex-wrap gap-1 mb-4">
          {nums.map((x, idx) => <Cell key={idx} ch={x} state={idx === i ? "cursor" : idx < i ? "win" : "base"} />)}
        </div>
        <div className="flex gap-8">
          <div>
            <Label>min-heap (k=3) · top = bouncer</Label>
            <div className="flex gap-1">{heap.map((x, idx) => <Cell key={idx} ch={x} state={idx === 0 ? "left" : "win"} />)}</div>
          </div>
          {evicted !== undefined && <div><Label>evicted</Label><Cell ch={evicted} state="hot" /></div>}
        </div>
      </div>
    );
  }

  return null;
}

/* ============ STEPPER ============ */
function Visualizer({ algo, onVisited }) {
  const [steps, setSteps] = useState(() => algo.build());
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    setSteps(algo.build());
    setIdx(0);
    setPlaying(false);
  }, [algo]);

  useEffect(() => {
    if (playing) {
      timer.current = setInterval(() => {
        setIdx(p => {
          if (p >= steps.length - 1) { setPlaying(false); return p; }
          return p + 1;
        });
      }, 1300);
    }
    return () => clearInterval(timer.current);
  }, [playing, steps.length]);

  useEffect(() => {
    if (idx === steps.length - 1) onVisited(algo.id);
  }, [idx, steps.length, algo.id, onVisited]);

  const step = steps[idx];
  const btn = "px-3 py-2 rounded text-xs font-semibold";

  return (
    <div className="rounded-lg p-4 sm:p-5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="mb-1 text-base font-bold" style={{ color: C.text }}>{algo.name}</div>
      <div className="mb-4 text-xs" style={{ color: C.dim, fontFamily: MONO }}>{algo.tag}</div>

      <div className="mb-5 overflow-x-auto">
        <StageFor algo={algo} step={step} />
      </div>

      {/* narration — the signature element */}
      <div className="rounded p-3 mb-4 text-sm leading-relaxed" style={{ background: "#0D1119", border: `1px solid ${C.line}`, borderLeft: `3px solid ${step.done ? C.green : C.amber}`, color: C.text, minHeight: "3.4rem" }}>
        <span style={{ color: step.done ? C.green : C.amber, fontFamily: MONO, fontSize: "0.7rem" }}>{step.done ? "DONE ▸ " : "NARRATE ▸ "}</span>
        {step.narr}
      </div>

      {/* step tape */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto py-1">
        {steps.map((_, i2) => (
          <button key={i2} onClick={() => { setPlaying(false); setIdx(i2); }}
            className="rounded-sm shrink-0"
            style={{ width: Math.max(8, Math.min(18, 320 / steps.length)), height: 8, background: i2 === idx ? C.amber : i2 < idx ? "#5a4a28" : C.line, transition: "background 150ms" }}
            aria-label={`step ${i2 + 1}`} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text }} onClick={() => { setPlaying(false); setIdx(0); }}>⟲ reset</button>
        <button className={btn} style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text }} onClick={() => { setPlaying(false); setIdx(p => Math.max(0, p - 1)); }}>← prev</button>
        <button className={btn} style={{ background: C.amber, color: "#0B0E14" }} onClick={() => setPlaying(p => !p)}>{playing ? "❚❚ pause" : "▶ play"}</button>
        <button className={btn} style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text }} onClick={() => { setPlaying(false); setIdx(p => Math.min(steps.length - 1, p + 1)); }}>next →</button>
        <span className="text-xs ml-auto" style={{ fontFamily: MONO, color: C.dim }}>{idx + 1} / {steps.length}</span>
      </div>
    </div>
  );
}

/* ============ QUIZ ============ */
function Quiz({ title, sub, questions, onAnswer, score }) {
  const [order] = useState(() => [...questions.keys()].sort(() => Math.random() - 0.5));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState(null);
  const q = questions[order[pos % order.length]];

  const choose = (i) => {
    if (picked !== null) return;
    setPicked(i);
    onAnswer(i === q.a);
  };
  const next = () => { setPicked(null); setPos(p => p + 1); };

  return (
    <div className="rounded-lg p-4 sm:p-5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-base font-bold" style={{ color: C.text }}>{title}</div>
        <div className="text-xs" style={{ fontFamily: MONO, color: C.dim }}>{score.right}/{score.total} correct</div>
      </div>
      <div className="mb-5 text-xs" style={{ color: C.dim }}>{sub}</div>

      <div className="rounded p-4 mb-4 text-sm leading-relaxed" style={{ background: "#0D1119", border: `1px solid ${C.line}`, color: C.text }}>
        {q.q}
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {q.opts.map((opt, i) => {
          let bg = C.panel2, border = C.line, color = C.text;
          if (picked !== null) {
            if (i === q.a) { bg = C.greenSoft; border = C.green; color = C.green; }
            else if (i === picked) { bg = C.redSoft; border = C.red; color = C.red; }
            else { color = C.dim; }
          }
          return (
            <button key={i} onClick={() => choose(i)}
              className="text-left rounded px-4 py-3 text-sm"
              style={{ background: bg, border: `1px solid ${border}`, color, fontFamily: MONO, transition: "all 150ms" }}>
              {opt}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="rounded p-3 mb-4 text-sm leading-relaxed" style={{ background: "#0D1119", borderLeft: `3px solid ${picked === q.a ? C.green : C.red}`, border: `1px solid ${C.line}`, color: C.text }}>
          <span style={{ color: picked === q.a ? C.green : C.red, fontFamily: MONO, fontSize: "0.7rem" }}>{picked === q.a ? "RIGHT ▸ " : "THE WHY ▸ "}</span>
          {q.why}
        </div>
      )}

      <button onClick={next} disabled={picked === null}
        className="px-4 py-2 rounded text-xs font-semibold"
        style={{ background: picked === null ? C.panel2 : C.amber, color: picked === null ? C.dim : "#0B0E14", border: `1px solid ${picked === null ? C.line : C.amber}` }}>
        next question →
      </button>
    </div>
  );
}

/* ============ DRILLS ============ */
const norm = (s) => s.replace(/\s+/g, "").toLowerCase();

function Drill({ drill, done, onComplete }) {
  const blanks = drill.lines.flatMap(l => Array.isArray(l) ? l.filter(p => typeof p === "object") : []);
  const [vals, setVals] = useState({});
  const [checked, setChecked] = useState(null); // {key: bool}
  const [revealed, setRevealed] = useState(false);

  const check = () => {
    const res = {};
    let all = true;
    blanks.forEach(b => {
      const ok = b.accept.some(a => norm(vals[b.k] || "") === norm(a));
      res[b.k] = ok;
      if (!ok) all = false;
    });
    setChecked(res);
    if (all) onComplete(drill.id);
  };
  const reveal = () => {
    const v = { ...vals };
    blanks.forEach(b => { v[b.k] = b.accept[0]; });
    setVals(v);
    setRevealed(true);
    setChecked(null);
  };
  const reset = () => { setVals({}); setChecked(null); setRevealed(false); };

  return (
    <div className="rounded-lg p-4 sm:p-5" style={{ background: C.panel, border: `1px solid ${done ? C.green : C.line}` }}>
      <div className="flex items-center gap-2 mb-1">
        <div className="text-base font-bold" style={{ color: C.text }}>{drill.name}</div>
        {done && <span className="text-xs px-2 py-0.5 rounded" style={{ background: C.greenSoft, color: C.green, fontFamily: MONO }}>✓ drilled</span>}
      </div>
      <div className="mb-4 text-xs" style={{ color: C.dim }}>{drill.desc}</div>

      <div className="rounded p-3 sm:p-4 mb-4 overflow-x-auto text-sm" style={{ background: "#0D1119", border: `1px solid ${C.line}`, fontFamily: MONO, lineHeight: 2 }}>
        {drill.lines.map((line, li) => {
          if (typeof line === "string") return <div key={li} style={{ color: C.dim, whiteSpace: "pre" }}>{line}</div>;
          return (
            <div key={li} style={{ whiteSpace: "pre", color: C.dim }}>
              {line.map((part, pi) => {
                if (typeof part === "string") return <span key={pi}>{part}</span>;
                const stateColor = checked === null ? C.line : checked[part.k] ? C.green : C.red;
                return (
                  <input key={pi} value={vals[part.k] || ""} placeholder={drill.hints[part.k]}
                    onChange={e => { setVals({ ...vals, [part.k]: e.target.value }); setChecked(null); }}
                    className="rounded px-2 py-0.5 text-sm mx-0.5"
                    style={{
                      fontFamily: MONO, width: `${part.w + 2}ch`, background: revealed ? C.amberSoft : C.panel2,
                      border: `1px solid ${revealed ? C.amber : stateColor}`, color: revealed ? C.amber : C.text, outline: "none",
                    }} />
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={check} className="px-4 py-2 rounded text-xs font-semibold" style={{ background: C.amber, color: "#0B0E14" }}>check</button>
        <button onClick={reveal} className="px-4 py-2 rounded text-xs font-semibold" style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text }}>reveal</button>
        <button onClick={reset} className="px-4 py-2 rounded text-xs font-semibold" style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text }}>clear</button>
        {checked !== null && Object.values(checked).every(Boolean) && (
          <span className="text-xs self-center" style={{ color: C.green, fontFamily: MONO }}>✓ all correct — now write the WHOLE thing blank-page in your editor</span>
        )}
        {revealed && <span className="text-xs self-center" style={{ color: C.amber, fontFamily: MONO }}>revealed — clear it and earn it</span>}
      </div>
    </div>
  );
}

/* ============ PROGRESS ============ */
function Progress({ progress, onReset }) {
  const pct = (r, t) => t === 0 ? "—" : Math.round((100 * r) / t) + "%";
  const rows = [
    { name: "Visualizers completed", val: `${progress.visited.length} / ${ALGOS.length}`, full: progress.visited.length === ALGOS.length },
    { name: "Pattern recognition", val: `${progress.pattern.right} / ${progress.pattern.total} (${pct(progress.pattern.right, progress.pattern.total)})`, full: progress.pattern.total >= 18 && progress.pattern.right / Math.max(1, progress.pattern.total) >= 0.85 },
    { name: "Big-O accuracy", val: `${progress.bigo.right} / ${progress.bigo.total} (${pct(progress.bigo.right, progress.bigo.total)})`, full: progress.bigo.total >= 14 && progress.bigo.right / Math.max(1, progress.bigo.total) >= 0.85 },
    { name: "Templates drilled", val: `${progress.drills.length} / ${DRILLS.length}`, full: progress.drills.length === DRILLS.length },
  ];
  return (
    <div className="rounded-lg p-4 sm:p-5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="text-base font-bold mb-4" style={{ color: C.text }}>Progress</div>
      <div className="flex flex-col gap-2 mb-5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between rounded px-4 py-3" style={{ background: "#0D1119", border: `1px solid ${r.full ? C.green : C.line}` }}>
            <span className="text-sm" style={{ color: C.text }}>{r.name}</span>
            <span className="text-sm" style={{ fontFamily: MONO, color: r.full ? C.green : C.cyan }}>{r.val}</span>
          </div>
        ))}
      </div>
      <div className="rounded p-3 mb-4 text-sm leading-relaxed" style={{ background: "#0D1119", border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.amber}`, color: C.text }}>
        <span style={{ color: C.amber, fontFamily: MONO, fontSize: "0.7rem" }}>HONEST ▸ </span>
        This app builds recognition and template recall. It does not replace blank-page solving in a bare editor with a timer — that's where the actual muscle forms. Treat green checks here as permission to drill, not proof you're done.
      </div>
      <button onClick={onReset} className="px-4 py-2 rounded text-xs font-semibold" style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.red }}>reset all progress</button>
    </div>
  );
}

/* ============ APP ============ */
export default function App() {
  const [tab, setTab] = useState("learn");
  const [algoId, setAlgoId] = useState(ALGOS[0].id);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await loadProgress();
      if (p) setProgress({ ...EMPTY_PROGRESS, ...p });
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) saveProgress(progress); }, [progress, loaded]);

  const markVisited = useCallback((id) => {
    setProgress(p => p.visited.includes(id) ? p : { ...p, visited: [...p.visited, id] });
  }, []);
  const onPattern = (ok) => setProgress(p => ({ ...p, pattern: { right: p.pattern.right + (ok ? 1 : 0), total: p.pattern.total + 1 } }));
  const onBigO = (ok) => setProgress(p => ({ ...p, bigo: { right: p.bigo.right + (ok ? 1 : 0), total: p.bigo.total + 1 } }));
  const onDrill = (id) => setProgress(p => p.drills.includes(id) ? p : { ...p, drills: [...p.drills, id] });

  const algo = ALGOS.find(a => a.id === algoId);
  const tabs = [
    { id: "learn", label: "Visualize" },
    { id: "recognize", label: "Recognize" },
    { id: "bigo", label: "Cost" },
    { id: "drill", label: "Drill" },
    { id: "progress", label: "Progress" },
  ];

  return (
    <div className="min-h-screen" style={{ background: C.bg, fontFamily: SANS, color: C.text }}>
      {/* header */}
      <div className="px-4 sm:px-6 pt-6 pb-4" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-xs mb-1" style={{ fontFamily: MONO, color: C.amber, letterSpacing: "0.18em" }}>TRACE TERMINAL</div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: C.text }}>
            Step through it. Say the invariant. Then earn it blank-page.
          </h1>
          <div className="text-xs mt-1.5" style={{ color: C.dim }}>
            Every algorithm here runs as a tape — the amber line is what you'd narrate aloud in the room.
          </div>
        </div>
      </div>

      {/* tab nav */}
      <div className="px-4 sm:px-6 py-3 sticky top-0 z-10" style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
        <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-full text-xs font-semibold shrink-0"
              style={{
                fontFamily: MONO, letterSpacing: "0.05em",
                background: tab === t.id ? C.amber : "transparent",
                color: tab === t.id ? "#0B0E14" : C.dim,
                border: `1px solid ${tab === t.id ? C.amber : C.line}`,
                transition: "all 150ms",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">

          {tab === "learn" && (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {ALGOS.map(a => (
                  <button key={a.id} onClick={() => setAlgoId(a.id)}
                    className="px-3 py-2 rounded text-xs shrink-0"
                    style={{
                      fontFamily: MONO,
                      background: a.id === algoId ? C.amberSoft : C.panel,
                      border: `1px solid ${a.id === algoId ? C.amber : progress.visited.includes(a.id) ? C.green : C.line}`,
                      color: a.id === algoId ? C.amber : progress.visited.includes(a.id) ? C.green : C.dim,
                    }}>
                    {progress.visited.includes(a.id) ? "✓ " : ""}{a.name}
                  </button>
                ))}
              </div>
              <Visualizer algo={algo} onVisited={markVisited} />
            </>
          )}

          {tab === "recognize" && (
            <Quiz
              title="Pattern recognition"
              sub="Read the problem the way the matrix reads it: archetype → pattern. This is the skill that transfers."
              questions={PATTERN_QS}
              onAnswer={onPattern}
              score={progress.pattern}
            />
          )}

          {tab === "bigo" && (
            <Quiz
              title="Cost instincts"
              sub="Count the touches, multiply nested loops, halving is log. Derive, don't recall."
              questions={BIGO_QS}
              onAnswer={onBigO}
              score={progress.bigo}
            />
          )}

          {tab === "drill" && (
            <>
              <div className="rounded p-3 text-sm leading-relaxed" style={{ background: C.panel, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.cyan}`, color: C.text }}>
                <span style={{ color: C.cyan, fontFamily: MONO, fontSize: "0.7rem" }}>PROTOCOL ▸ </span>
                The blanks are the load-bearing lines — the exact places hands fumble under a clock. Fill them, check, then close this app and write the whole template from nothing in a plain editor. That second step is the rep that counts.
              </div>
              {DRILLS.map(d => <Drill key={d.id} drill={d} done={progress.drills.includes(d.id)} onComplete={onDrill} />)}
            </>
          )}

          {tab === "progress" && (
            <Progress progress={progress} onReset={() => setProgress(EMPTY_PROGRESS)} />
          )}

          <div className="text-center text-xs py-4" style={{ color: "#3A4254", fontFamily: MONO }}>
            both fingers only move forward · narrate even the being-stuck · sleep is consolidation
          </div>
        </div>
      </div>
    </div>
  );
}
