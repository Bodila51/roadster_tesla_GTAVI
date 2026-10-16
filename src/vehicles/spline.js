function monotoneSpline(a) {
  if (typeof a == "number") return () => a;
  const e = a.slice().sort((c, r) => c[0] - r[0]),
    s = e.length,
    t = e.map((c) => c[0]),
    i = e.map((c) => c[1]);
  if (s === 1) return () => i[0];
  const o = [],
    n = new Array(s);
  for (let c = 0; c < s - 1; c++) o.push((i[c + 1] - i[c]) / (t[c + 1] - t[c]));
  (n[0] = o[0]), (n[s - 1] = o[s - 2]);
  for (let c = 1; c < s - 1; c++)
    n[c] = o[c - 1] * o[c] <= 0 ? 0 : (o[c - 1] + o[c]) / 2;
  for (let c = 0; c < s - 1; c++) {
    if (o[c] === 0) {
      (n[c] = 0), (n[c + 1] = 0);
      continue;
    }
    const r = n[c] / o[c],
      l = n[c + 1] / o[c],
      d = r * r + l * l;
    if (d > 9) {
      const f = 3 / Math.sqrt(d);
      (n[c] = f * r * o[c]), (n[c + 1] = f * l * o[c]);
    }
  }
  return (c) => {
    if (c <= t[0]) return i[0];
    if (c >= t[s - 1]) return i[s - 1];
    let r = 0,
      l = s - 1;
    for (; l - r > 1; ) {
      const S = (r + l) >> 1;
      t[S] > c ? (l = S) : (r = S);
    }
    const d = t[l] - t[r],
      f = (c - t[r]) / d,
      p = f * f,
      w = p * f;
    return (
      (2 * w - 3 * p + 1) * i[r] +
      (w - 2 * p + f) * d * n[r] +
      (-2 * w + 3 * p) * i[l] +
      (w - p) * d * n[l]
    );
  };
}

export { monotoneSpline };
