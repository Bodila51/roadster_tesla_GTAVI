"""Small offline DSP kit used to render the Roadster sound set.

Everything here is plain numpy/scipy. Signals are float64 arrays, mono (n,)
or stereo (n, 2). Sample rate is SR unless stated.
"""
import numpy as np
from scipy import signal

SR = 44100
TAU = 2 * np.pi


def tt(dur, sr=SR):
    return np.arange(int(round(dur * sr))) / sr


def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), 1e-12))


def undb(d):
    return 10.0 ** (np.asarray(d) / 20.0)


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)) + 1e-20))


def smoothstep(x, a, b):
    u = np.clip((np.asarray(x, dtype=float) - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


# ---------------------------------------------------------------- noise ----
def spec_shape(f, lo=None, hi=None, n_lo=1, n_hi=1):
    """Butterworth-like magnitude: n_lo/n_hi orders (6 dB/oct each)."""
    m = np.ones_like(f)
    fs = np.maximum(f, 1e-3)
    if lo:
        m = m / np.sqrt(1 + (lo / fs) ** (2 * n_lo))
    if hi:
        m = m / np.sqrt(1 + (fs / hi) ** (2 * n_hi))
    return m


def bump(f, f0, q, gain_db):
    """Smooth resonant bump (log-gaussian), gain in dB at f0."""
    fs = np.maximum(f, 1e-3)
    oct_w = 1.0 / q  # width in octaves (approx)
    g = np.exp(-0.5 * (np.log2(fs / f0) / (oct_w * 0.6)) ** 2)
    return undb(gain_db * g)


def jet_psd(f, fp):
    """Broad jet-mixing spectrum: PSD ~ f^2 below fp, ~ f^-2 above."""
    r = np.maximum(f, 1e-3) / fp
    return r ** 2 / (1 + r ** 2) ** 2


def pnoise(n, mag, rng, sr=SR):
    """Periodic gaussian noise of n samples with magnitude response mag(f).

    mag is a callable over rfft frequencies or an array. Output is unit RMS and
    loops seamlessly (it is circular by construction).
    """
    f = np.fft.rfftfreq(n, 1 / sr)
    m = mag(f) if callable(mag) else mag
    X = m * (rng.standard_normal(len(f)) + 1j * rng.standard_normal(len(f)))
    X[0] = 0
    x = np.fft.irfft(X, n)
    return x / rms(x)


def plfo(n, cutoff, rng, sr=SR, order=2):
    """Smooth periodic random modulation signal, unit RMS, band-limited."""
    return pnoise(n, lambda f: spec_shape(f, hi=cutoff, n_hi=order) * (f > 0), rng, sr)


def white(n, rng):
    return rng.standard_normal(n)


def pink(n, rng, sr=SR):
    return pnoise(n, lambda f: 1 / np.sqrt(np.maximum(f, 20)), rng, sr)


# -------------------------------------------------------------- filters ----
def _sos(kind, f, order, sr=SR):
    nyq = sr / 2
    if kind == 'bp':
        return signal.butter(order, [f[0] / nyq, min(f[1] / nyq, 0.999)], 'bandpass', output='sos')
    return signal.butter(order, min(f / nyq, 0.999), {'lp': 'low', 'hp': 'high'}[kind], output='sos')


def lp(x, f, order=2, sr=SR):
    return signal.sosfilt(_sos('lp', f, order, sr), x, axis=0)


def hp(x, f, order=2, sr=SR):
    return signal.sosfilt(_sos('hp', f, order, sr), x, axis=0)


def bp(x, lo, hi, order=2, sr=SR):
    return signal.sosfilt(_sos('bp', (lo, hi), order, sr), x, axis=0)


def biquad(kind, f0, q=0.707, gain_db=0.0, sr=SR):
    """RBJ cookbook biquad -> (b, a)."""
    A = 10 ** (gain_db / 40)
    w0 = TAU * f0 / sr
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2 * q)
    if kind == 'peak':
        b = [1 + al * A, -2 * cw, 1 - al * A]
        a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == 'lowshelf':
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * cw + s), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - s)]
        a = [(A + 1) + (A - 1) * cw + s, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - s]
    elif kind == 'highshelf':
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)]
        a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]
    elif kind == 'bpq':  # constant 0 dB peak gain bandpass
        b = [al, 0, -al]
        a = [1 + al, -2 * cw, 1 - al]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return b, a


def eq(x, kind, f0, q=0.707, gain_db=0.0, sr=SR):
    b, a = biquad(kind, f0, q, gain_db, sr)
    return signal.lfilter(b, a, x, axis=0)


def reson(x, f0, q, sr=SR):
    return eq(x, 'bpq', f0, q, 0, sr)


def svf_sweep(x, fc, q, mode='bp', sr=SR):
    """Time-varying state-variable filter (Chamberlin/TPT). fc: array per sample."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape[:1])
    g = np.tan(np.pi * np.clip(fc, 10, sr * 0.45) / sr)
    k = 1.0 / q
    y = np.zeros_like(x)
    s1 = s2 = 0.0
    for i in range(len(x)):
        gi = g[i]
        hp_ = (x[i] - (k + gi) * s1 - s2) / (1 + k * gi + gi * gi)
        bp_ = gi * hp_ + s1
        lp_ = gi * bp_ + s2
        s1 = gi * hp_ + bp_
        s2 = gi * bp_ + lp_
        y[i] = bp_ if mode == 'bp' else (lp_ if mode == 'lp' else hp_)
    return y


def stft_shape(x, gain_fn, nfft=1024, hop=256, sr=SR):
    """Time-varying spectral gain. gain_fn(t[None,:], f[:,None]) -> gain matrix."""
    f, t, Z = signal.stft(x, fs=sr, nperseg=nfft, noverlap=nfft - hop, boundary='even', padded=True)
    G = gain_fn(t[None, :], f[:, None])
    _, y = signal.istft(Z * G, fs=sr, nperseg=nfft, noverlap=nfft - hop, boundary=True)
    y = y[: len(x)]
    if len(y) < len(x):
        y = np.pad(y, (0, len(x) - len(y)))
    return y


# ----------------------------------------------------------- envelopes -----
def env_ad(t, a, d, curve=1.0):
    """Attack (linear, seconds) then exponential decay with time-constant d."""
    e = np.where(t < a, t / max(a, 1e-6), np.exp(-(t - a) / d))
    return e ** curve


def env_t60(t, t60, t0=0.0):
    return np.where(t >= t0, np.exp(-6.91 * (t - t0) / t60), 0.0)


def fade(x, fin=0.0, fout=0.0, sr=SR):
    y = x.copy()
    n = len(y)
    if fin > 0:
        k = min(n, int(fin * sr))
        w = np.sin(np.linspace(0, np.pi / 2, k)) ** 2
        y[:k] = (y[:k].T * w).T
    if fout > 0:
        k = min(n, int(fout * sr))
        w = np.cos(np.linspace(0, np.pi / 2, k)) ** 2
        y[n - k:] = (y[n - k:].T * w).T
    return y


def delay(x, sec, sr=SR):
    k = int(round(sec * sr))
    if k <= 0:
        return x
    return np.concatenate([np.zeros((k,) + x.shape[1:]), x])[: len(x)]


def place(dst, src, at, gain=1.0, sr=SR):
    """Mix src into dst starting at time `at` seconds (in place)."""
    i = int(round(at * sr))
    if i >= len(dst):
        return dst
    m = min(len(src), len(dst) - i)
    dst[i:i + m] += gain * src[:m]
    return dst


# ------------------------------------------------------------ synthesis ----
def modal(t, freqs, t60s, amps, rng=None, jitter=0.0):
    y = np.zeros_like(t)
    for f, d, a in zip(freqs, t60s, amps):
        if rng is not None and jitter:
            f = f * (1 + jitter * rng.uniform(-1, 1))
        ph = rng.uniform(0, TAU) if rng is not None else 0.0
        y += a * np.exp(-6.91 * t / d) * np.sin(TAU * f * t + ph)
    return y


def osc_phase(freq, sr=SR):
    """Integrate an instantaneous frequency array to phase (radians)."""
    return TAU * np.cumsum(freq) / sr


def fm_tone(t, fc, ratio, index, amp, fb_detune=0.0):
    """Two-operator FM. index/amp may be arrays (envelopes)."""
    mod = index * np.sin(TAU * fc * ratio * t)
    return amp * np.sin(TAU * fc * (1 + fb_detune) * t + mod)


def mallet(t, f, bright, rng):
    """Short felt/wood knock: noise burst through a resonance + a damped sine."""
    n = len(t)
    burst = rng.standard_normal(n) * np.exp(-t / 0.0015)
    k = reson(burst, f * 2.4, 2.0) * 0.6 + reson(burst, f * 5.1, 3.0) * bright
    body = np.sin(TAU * f * t) * np.exp(-t / 0.012)
    return k + body * 0.8


def click(t, f, q, rng, decay=0.004):
    imp = np.zeros_like(t)
    imp[0] = 1.0
    imp[1:6] += rng.standard_normal(5) * 0.3
    return reson(imp, f, q) * np.exp(-t / decay) * q


def softclip(x, drive=1.0):
    return np.tanh(drive * x) / np.tanh(drive)


def saturate(x, amount):
    """Gentle asymmetric saturation for weight on low thumps."""
    return np.tanh(x * amount + 0.05 * x * x * amount) / np.tanh(amount)


# ------------------------------------------------------------- reverbs -----
def gen_ir(dur, rt_lo, rt_hi, rng, predelay=0.0, sr=SR, stereo=True, f_split=2500.0,
           early=None, damp_hi=12000.0):
    """Exponential-decay noise IR with frequency dependent RT60.

    early: list of (time, gain, pan) discrete reflections.
    """
    n = int(dur * sr)
    chans = 2 if stereo else 1
    out = np.zeros((n, chans))
    for c in range(chans):
        w = rng.standard_normal(n)

        def g(t, f):
            rt = rt_lo + (rt_hi - rt_lo) * smoothstep(np.log2(np.maximum(f, 20) / f_split), -2.5, 2.5)
            return np.exp(-6.91 * t / rt) * spec_shape(f, lo=120, hi=damp_hi, n_lo=1, n_hi=2)

        y = stft_shape(w, g, nfft=512, hop=128, sr=sr)
        out[:, c] = y
    out *= np.minimum(1.0, tt(dur, sr) / 0.004)[:, None]  # soften onset
    if early:
        for (tm, gain, pan) in early:
            i = int(tm * sr)
            if i < n:
                out[i, 0] += gain * np.sqrt(0.5 * (1 - pan)) * 8
                out[i, 1 if stereo else 0] += gain * np.sqrt(0.5 * (1 + pan)) * 8
    if predelay:
        out = np.concatenate([np.zeros((int(predelay * sr), chans)), out])
    out /= np.sqrt(np.sum(out ** 2) / chans)
    return out if stereo else out[:, 0]


def convolve(x, ir):
    """x mono or stereo; ir mono or stereo. Returns stereo if either is stereo."""
    if x.ndim == 1 and ir.ndim == 1:
        return signal.fftconvolve(x, ir)[: len(x)]
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    if ir.ndim == 1:
        ir = np.stack([ir, ir], 1)
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)


def add_reverb(x, ir, wet, tail=0.0, sr=SR):
    if tail:
        pad = np.zeros((int(tail * sr),) + x.shape[1:])
        x = np.concatenate([x, pad])
    w = convolve(x, ir)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    return x + wet * w


# -------------------------------------------------------------- stereo -----
def pan(x, p):
    """Constant-power pan of mono x, p in [-1, 1] (scalar or array)."""
    a = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


def to_stereo(x):
    return x if x.ndim == 2 else np.stack([x, x], 1)


def widen(x, rng, amount=0.3, ms=8.0):
    """Mid/side widening via a short decorrelating all-pass-ish noise conv on side."""
    x = to_stereo(x)
    m = (x[:, 0] + x[:, 1]) * 0.5
    s = (x[:, 0] - x[:, 1]) * 0.5
    k = int(ms * SR / 1000)
    ir = rng.standard_normal(k) * np.exp(-np.arange(k) / (k / 4))
    ir /= np.sqrt(np.sum(ir ** 2))
    s2 = s + amount * signal.fftconvolve(m, ir)[: len(m)]
    return np.stack([m + s2, m - s2], 1)


# --------------------------------------------------------------- loops -----
def loopify(x, L, X, sr=SR):
    """Make a seamless loop of L seconds from x (needs len >= L+X seconds).

    Equal-power crossfade of the region past L back onto the start.
    """
    nL, nX = int(round(L * sr)), int(round(X * sr))
    assert len(x) >= nL + nX
    y = x[:nL].copy()
    w = np.linspace(0, np.pi / 2, nX)
    fi, fo = np.sin(w), np.cos(w)
    if x.ndim == 2:
        fi, fo = fi[:, None], fo[:, None]
    y[:nX] = x[:nX] * fi + x[nL:nL + nX] * fo
    return y


def pad_loop(y, pad, sr=SR):
    """Wrap-pad a loop so any window of its length inside the file is seamless."""
    k = int(round(pad * sr))
    return np.concatenate([y[-k:], y, y[:k]])


# ------------------------------------------------------------ loudness -----
def _kw_filters(sr):
    # ITU-R BS.1770-4 K-weighting (pyloudnorm-style analog matched biquads)
    G, Q, fc = 3.99984385397, 0.7071752369554193, 1681.9744509555319
    A = 10 ** (G / 40)
    w0 = TAU * fc / sr
    al = np.sin(w0) / (2 * Q)
    cw = np.cos(w0)
    b1 = [A * ((A + 1) + (A - 1) * cw + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * cw),
          A * ((A + 1) + (A - 1) * cw - 2 * np.sqrt(A) * al)]
    a1 = [(A + 1) - (A - 1) * cw + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * cw),
          (A + 1) - (A - 1) * cw - 2 * np.sqrt(A) * al]
    Q2, fc2 = 0.5003270373253953, 38.13547087613982
    w0 = TAU * fc2 / sr
    al = np.sin(w0) / (2 * Q2)
    cw = np.cos(w0)
    b2 = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
    a2 = [1 + al, -2 * cw, 1 - al]
    return (np.array(b1) / a1[0], np.array(a1) / a1[0]), (np.array(b2) / a2[0], np.array(a2) / a2[0])


def loudness(x, sr=SR):
    """Return dict with integrated LUFS, max momentary, max short-term, peak, true peak (dBFS)."""
    x = to_stereo(np.asarray(x, dtype=float))
    (b1, a1), (b2, a2) = _kw_filters(sr)
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)
    p = np.sum(y ** 2, axis=1)  # sum over channels (G=1)

    def blocks(win, step):
        nw, ns = int(win * sr), int(step * sr)
        if len(p) < nw:
            return np.array([np.mean(p)]) if len(p) else np.array([1e-20])
        c = np.concatenate([[0], np.cumsum(p)])
        idx = np.arange(0, len(p) - nw + 1, ns)
        return (c[idx + nw] - c[idx]) / nw

    zm = blocks(0.4, 0.1)
    lm = -0.691 + 10 * np.log10(zm + 1e-20)
    gated = zm[lm > -70]
    if len(gated):
        rel = -0.691 + 10 * np.log10(np.mean(gated)) - 10
        g2 = zm[(lm > -70) & (lm > rel)]
        li = -0.691 + 10 * np.log10(np.mean(g2)) if len(g2) else -99.0
    else:
        li = -99.0
    zs = blocks(3.0, 0.1)
    ls = -0.691 + 10 * np.log10(zs + 1e-20)
    pk = float(np.max(np.abs(x))) if len(x) else 0.0
    tp = float(np.max(np.abs(signal.resample_poly(x, 4, 1, axis=0)))) if len(x) else 0.0
    return dict(lufs=float(li), m_max=float(np.max(lm)), s_max=float(np.max(ls)),
                peak_db=float(db(pk)), tp_db=float(db(tp)), dur=len(x) / sr,
                momentary=lm)


def norm_peak(x, dbfs=-1.0):
    return x * undb(dbfs) / (np.max(np.abs(x)) + 1e-12)


def norm_lufs(x, target):
    L = loudness(x)['lufs']
    return x * undb(target - L)
